/**
 * «Conexión con su web»: how the ERP reads this supplier's orders from the
 * pages of its website (PUT /api/suppliers/:id/connection). Pages are
 * addresses on its site; places are CSS selectors inside each page.
 */

export interface SupplierConnection {
  kind: "html";
  baseUrl: string;
  login: { path: string; userField: string; passwordField: string };
  history: {
    path: string;
    rowSelector: string;
    referenceSelector: string;
    dateSelector: string;
    totalSelector: string;
    paymentSelector: string | null;
    statusSelector: string | null;
    invoiceLinkSelector: string | null;
    detailLinkSelector: string;
    idPattern: string;
  };
  detail: {
    path: string;
    rowSelector: string;
    productSelector: string;
    refSelector: string | null;
    refPattern: string | null;
    productLinkSelector: string | null;
    productSearchPath: string | null;
    quantitySelector: string;
    unitPriceSelector: string;
    lineTotalSelector: string | null;
  };
}

type Section = "login" | "history" | "detail";
/** Every field of the form, as typed, named section.key (or baseUrl). */
export type ConnectionDraft = Record<string, string>;
export type ConnectionErrors = Record<string, string | undefined>;

/**
 * A PrestaShop 1.7 shop («classic» theme), checked against rphoneb2b.com.
 * The same values as the server's PRESTASHOP_DEFAULTS.
 */
export const PRESTASHOP: Omit<SupplierConnection, "baseUrl"> = {
  kind: "html",
  login: { path: "/index.php?controller=authentication&back=history", userField: "email", passwordField: "password" },
  history: {
    path: "/historial-compra",
    rowSelector: "#content table tbody tr",
    referenceSelector: "th",
    dateSelector: "td:nth-of-type(1)",
    totalSelector: "td:nth-of-type(2)",
    paymentSelector: "td:nth-of-type(3)",
    statusSelector: "td:nth-of-type(4)",
    invoiceLinkSelector: 'a[href*="pdf-invoice"]',
    detailLinkSelector: 'a[href*="order-detail"]',
    idPattern: "id_order=(\\d+)",
  },
  detail: {
    path: "/index.php?controller=order-detail&id_order={id}",
    rowSelector: "#order-products tbody tr",
    productSelector: "td:nth-of-type(1) strong",
    refSelector: "td:nth-of-type(1)",
    refPattern: "Referencia:\\s*(\\S+)",
    productLinkSelector: "td:nth-of-type(1) a",
    productSearchPath: "/busqueda?controller=search&s={ref}",
    quantitySelector: "td:nth-of-type(2)",
    unitPriceSelector: "td:nth-of-type(3)",
    lineTotalSelector: "td:nth-of-type(4)",
  },
};

/** The kind of each field: how it is checked. */
type Kind = "page" | "input" | "selector" | "pattern";
interface FieldSpec {
  key: string;
  label: string;
  kind: Kind;
  optional?: boolean;
  /** Text the page address must carry. */
  needs?: string;
}

export const FIELDS: Record<Section, FieldSpec[]> = {
  login: [
    { key: "login.path", label: "Página de inicio de sesión", kind: "page" },
    { key: "login.userField", label: "Campo del usuario", kind: "input" },
    { key: "login.passwordField", label: "Campo de la contraseña", kind: "input" },
  ],
  history: [
    { key: "history.path", label: "Página del historial", kind: "page" },
    { key: "history.rowSelector", label: "Filas del historial", kind: "selector" },
    { key: "history.referenceSelector", label: "Referencia", kind: "selector" },
    { key: "history.dateSelector", label: "Fecha", kind: "selector" },
    { key: "history.totalSelector", label: "Total", kind: "selector" },
    { key: "history.paymentSelector", label: "Pago", kind: "selector", optional: true },
    { key: "history.statusSelector", label: "Estado", kind: "selector", optional: true },
    { key: "history.invoiceLinkSelector", label: "Enlace a la factura", kind: "selector", optional: true },
    { key: "history.detailLinkSelector", label: "Enlace al pedido", kind: "selector" },
    { key: "history.idPattern", label: "Id dentro del enlace", kind: "pattern" },
  ],
  detail: [
    { key: "detail.path", label: "Página del pedido", kind: "page", needs: "{id}" },
    { key: "detail.productSearchPath", label: "Búsqueda del producto", kind: "page", optional: true, needs: "{ref}" },
    { key: "detail.rowSelector", label: "Filas del pedido", kind: "selector" },
    { key: "detail.productSelector", label: "Producto", kind: "selector" },
    { key: "detail.refSelector", label: "Referencia", kind: "selector", optional: true },
    { key: "detail.refPattern", label: "Referencia dentro del texto", kind: "pattern", optional: true },
    { key: "detail.productLinkSelector", label: "Enlace al producto", kind: "selector", optional: true },
    { key: "detail.quantitySelector", label: "Cantidad", kind: "selector" },
    { key: "detail.unitPriceSelector", label: "Precio unitario", kind: "selector" },
    { key: "detail.lineTotalSelector", label: "Precio total", kind: "selector", optional: true },
  ],
};
const ALL = Object.values(FIELDS).flat();

/** The saved connection as form fields; without one, PrestaShop's places and the supplier's web. */
export function connectionDraftFrom(c: SupplierConnection | null, website?: string | null): ConnectionDraft {
  const source = c ?? { ...PRESTASHOP, baseUrl: website?.startsWith("https://") ? new URL(website).origin : "" };
  const draft: ConnectionDraft = { baseUrl: source.baseUrl };
  for (const { key } of ALL) {
    const [section, name] = key.split(".") as [Section, string];
    const value = (source[section] as Record<string, string | null>)[name];
    draft[key] = value ?? "";
  }
  return draft;
}

const BASE_URL = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(:\d{2,5})?\/?$/i;
const PATH = /^\/(?!\/)[^\s\\]*$/;
const DOTS = /(^|\/)\.\.?(\/|\?|$)/;
const INPUT = /^[A-Za-z0-9_$.[\]-]+$/;

const validSelector = (s: string) => {
  try {
    document.createDocumentFragment().querySelector(s);
    return true;
  } catch {
    return false;
  }
};
const oneGroup = (s: string) => {
  try {
    return new RegExp(`${s}|`).exec("")!.length === 2;
  } catch {
    return false;
  }
};

/** The same rules the server applies, shown next to each field. */
export function validateConnection(d: ConnectionDraft): ConnectionErrors {
  const e: ConnectionErrors = {};
  const base = d.baseUrl.trim();
  if (!base) e.baseUrl = "Obligatorio";
  else if (!BASE_URL.test(base)) e.baseUrl = "Solo https:// y el dominio, sin rutas";
  for (const f of ALL) {
    const v = (d[f.key] ?? "").trim();
    if (!v) {
      if (!f.optional) e[f.key] = "Obligatorio";
      continue;
    }
    if (f.kind === "page") {
      if (!PATH.test(v)) e[f.key] = "Debe empezar por /";
      else if (DOTS.test(v)) e[f.key] = "No puede llevar «..»";
      else if (f.needs && !v.includes(f.needs)) e[f.key] = `Tiene que llevar ${f.needs}`;
    } else if (f.kind === "input" && !INPUT.test(v)) {
      e[f.key] = "Escribe el nombre del campo";
    } else if (f.kind === "selector" && !validSelector(v)) {
      e[f.key] = "No es un selector válido";
    } else if (f.kind === "pattern" && !oneGroup(v)) {
      e[f.key] = "Una expresión con un solo grupo entre paréntesis";
    }
  }
  return e;
}

export function connectionBody(d: ConnectionDraft): SupplierConnection {
  const out = { kind: "html", baseUrl: d.baseUrl.trim().replace(/\/+$/, ""), login: {}, history: {}, detail: {} } as Record<
    string,
    unknown
  >;
  for (const f of ALL) {
    const [section, name] = f.key.split(".");
    const v = (d[f.key] ?? "").trim();
    (out[section] as Record<string, string | null>)[name] = v || (f.optional ? null : "");
  }
  return out as unknown as SupplierConnection;
}

/** POST /api/suppliers/:id/test: what the ERP understood, nothing saved. */
export interface WebOrder {
  externalId: string;
  reference: string;
  date: string | null;
  total: string | null;
  payment: string | null;
  status: string | null;
  invoiceUrl: string | null;
  detailUrl: string;
}
export interface WebOrderLine {
  description: string;
  ref: string | null;
  productUrl: string | null;
  quantity: number | null;
  unitPrice: string | null;
  lineTotal: string | null;
}
export interface WebTestResult {
  ordersFound: number;
  orders: WebOrder[];
  sample: { order: WebOrder; lines: WebOrderLine[] } | null;
  warnings: string[];
}
