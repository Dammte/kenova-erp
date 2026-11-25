/** «Conexión con su web»: how the ERP reads this supplier's orders (PUT /api/suppliers/:id/connection). */

export interface SupplierConnection {
  baseUrl: string;
  login: {
    path: string;
    format: "json" | "form";
    userField: string;
    passwordField: string;
    session: "cookie" | "token";
    tokenPath: string | null;
  };
  orders: {
    listPath: string;
    itemsPath: string | null;
    detailPath: string | null;
    idField: string;
    numberField: string | null;
    dateField: string | null;
    linesPath: string;
    refField: string | null;
    descriptionField: string;
    quantityField: string;
    unitCostField: string;
  };
}

/** Every text field of the form, flat, as typed. */
export interface ConnectionDraft {
  baseUrl: string;
  loginPath: string;
  format: "json" | "form";
  userField: string;
  passwordField: string;
  session: "cookie" | "token";
  tokenPath: string;
  listPath: string;
  itemsPath: string;
  detailPath: string;
  idField: string;
  numberField: string;
  dateField: string;
  linesPath: string;
  refField: string;
  descriptionField: string;
  quantityField: string;
  unitCostField: string;
}
export type TextKey = Exclude<keyof ConnectionDraft, "format" | "session">;
export type ConnectionErrors = Partial<Record<keyof ConnectionDraft, string>>;

export const emptyConnection = (): ConnectionDraft => ({
  baseUrl: "",
  loginPath: "",
  format: "json",
  userField: "",
  passwordField: "",
  session: "cookie",
  tokenPath: "",
  listPath: "",
  itemsPath: "",
  detailPath: "",
  idField: "",
  numberField: "",
  dateField: "",
  linesPath: "",
  refField: "",
  descriptionField: "",
  quantityField: "",
  unitCostField: "",
});

export function connectionDraftFrom(c: SupplierConnection | null): ConnectionDraft {
  if (!c) return emptyConnection();
  const { path: loginPath, ...login } = c.login;
  const draft = { baseUrl: c.baseUrl, loginPath, ...login, ...c.orders };
  return Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v ?? ""])) as unknown as ConnectionDraft;
}

const BASE_URL = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(:\d{2,5})?\/?$/i;
const PATH = /^\/(?!\/)[^\s\\]*$/;
const DOTS = /(^|\/)\.\.?(\/|\?|$)/;
const FIELD = /^[A-Za-z0-9_$-]+(\.[A-Za-z0-9_$-]+)*$/;

const ROUTES: TextKey[] = ["loginPath", "listPath", "detailPath"];
const FIELDS: TextKey[] = [
  "userField",
  "passwordField",
  "tokenPath",
  "itemsPath",
  "idField",
  "numberField",
  "dateField",
  "linesPath",
  "refField",
  "descriptionField",
  "quantityField",
  "unitCostField",
];
const REQUIRED: TextKey[] = [
  "baseUrl",
  "loginPath",
  "userField",
  "passwordField",
  "listPath",
  "idField",
  "linesPath",
  "descriptionField",
  "quantityField",
  "unitCostField",
];

/** The same rules the server applies, shown next to each field. */
export function validateConnection(d: ConnectionDraft): ConnectionErrors {
  const e: ConnectionErrors = {};
  const v = (k: TextKey) => d[k].trim();
  if (v("baseUrl") && !BASE_URL.test(v("baseUrl"))) e.baseUrl = "Solo https:// y el dominio, sin rutas";
  for (const k of ROUTES) {
    if (v(k) && !PATH.test(v(k))) e[k] = "Debe empezar por /";
    else if (DOTS.test(v(k))) e[k] = "No puede llevar «..»";
  }
  if (v("detailPath") && !e.detailPath && !v("detailPath").includes("{id}")) e.detailPath = "Tiene que llevar {id}";
  for (const k of FIELDS) {
    if (v(k) && !FIELD.test(v(k))) e[k] = "Solo el nombre del campo, con puntos si va dentro de otro";
  }
  for (const k of REQUIRED) if (!v(k)) e[k] = "Obligatorio";
  if (d.session === "token" && !v("tokenPath")) e.tokenPath = "Obligatorio con sesión por token";
  return e;
}

export function connectionBody(d: ConnectionDraft): SupplierConnection {
  const t = (k: TextKey) => d[k].trim();
  const o = (k: TextKey) => d[k].trim() || null;
  return {
    baseUrl: t("baseUrl").replace(/\/+$/, ""),
    login: {
      path: t("loginPath"),
      format: d.format,
      userField: t("userField"),
      passwordField: t("passwordField"),
      session: d.session,
      tokenPath: d.session === "token" ? o("tokenPath") : null,
    },
    orders: {
      listPath: t("listPath"),
      itemsPath: o("itemsPath"),
      detailPath: o("detailPath"),
      idField: t("idField"),
      numberField: o("numberField"),
      dateField: o("dateField"),
      linesPath: t("linesPath"),
      refField: o("refField"),
      descriptionField: t("descriptionField"),
      quantityField: t("quantityField"),
      unitCostField: t("unitCostField"),
    },
  };
}
