/** Design 3.4 «Nuevo repuesto» / «Editar repuesto»: the form's pure logic. */

/** GET /api/inventory/:id, the fields the form edits. */
export interface PartData {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  brand: string | null;
  model: string | null;
  ubication: string | null;
  provider: string | null;
  stock: number | null;
  minimalStock: number | null;
  salesPrice: string | number | null;
  costPrice: string | null;
}

/** What the form holds: text as typed, amounts as MoneyInput reads them. */
export interface PartDraft {
  name: string;
  sku: string;
  category: string;
  brand: string;
  model: string;
  ubication: string;
  provider: string;
  description: string;
  stock: string;
  minimalStock: string;
  salesPrice: number | null;
  costPrice: number | null;
}

export type DraftErrors = Partial<Record<keyof PartDraft, string>>;

/** The categories offered before the inventory has any of its own. */
export const BASE_CATEGORIES = [
  "Pantallas",
  "Baterías",
  "Conectores",
  "Cámaras",
  "Audio",
  "Botones",
  "Placas base",
  "Carcasas",
  "Consumibles",
  "Otros",
];

export const emptyDraft = (): PartDraft => ({
  name: "",
  sku: "",
  category: "",
  brand: "",
  model: "",
  ubication: "",
  provider: "",
  description: "",
  stock: "0",
  minimalStock: "0",
  salesPrice: null,
  costPrice: null,
});

/** Amounts rounded to cents, as the field shows them. */
const cents = (v: string | number | null): number | null => {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

export const draftFrom = (p: PartData): PartDraft => ({
  name: p.name,
  sku: p.sku,
  category: p.category ?? "",
  brand: p.brand ?? "",
  model: p.model ?? "",
  ubication: p.ubication ?? "",
  provider: p.provider ?? "",
  description: p.description ?? "",
  stock: String(p.stock ?? 0),
  minimalStock: String(p.minimalStock ?? 0),
  salesPrice: cents(p.salesPrice),
  costPrice: cents(p.costPrice),
});

/** «PAN-IPHONE-13» from «Pantallas» and «iPhone 13»: the server's 20 characters at most. */
export function suggestSku(category: string, name: string): string {
  const clean = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  const prefix = clean(category).slice(0, 3);
  const rest = clean(name)
    .split("-")
    // The category is already in the prefix: «Pantalla iPhone 13» → «IPHONE-13».
    .filter((w, i) => !(i === 0 && prefix && w.startsWith(prefix)))
    .join("-");
  return [prefix, rest].filter(Boolean).join("-").slice(0, 20).replace(/-$/, "");
}

const wholeNumber = (s: string): number | null => (/^\d{1,7}$/.test(s.trim()) ? Number(s.trim()) : null);

/** What stops the form from saving, said per field. */
export function validate(d: PartDraft): DraftErrors {
  const e: DraftErrors = {};
  if (!d.name.trim()) e.name = "Escribe el nombre del repuesto.";
  else if (d.name.trim().length > 100) e.name = "Como mucho 100 caracteres.";
  if (!d.sku.trim()) e.sku = "Escribe un SKU o pulsa «Sugerir».";
  else if (d.sku.trim().length > 20) e.sku = "Como mucho 20 caracteres.";
  if (wholeNumber(d.stock) === null) e.stock = "Escribe un número entero, 0 o más.";
  if (wholeNumber(d.minimalStock) === null) e.minimalStock = "Escribe un número entero, 0 o más.";
  if (d.description.length > 150) e.description = `Como mucho 150 caracteres (llevas ${d.description.length}).`;
  for (const k of ["category", "brand", "model", "ubication", "provider"] as const) {
    if (d[k].trim().length > 50) e[k] = "Como mucho 50 caracteres.";
  }
  return e;
}

/** Empty text is sent as null on edit so a field can be cleared; on create it is left out. */
const text = (s: string, creating: boolean) => (s.trim() ? s.trim() : creating ? undefined : null);

/**
 * POST body for a new part, or PATCH body with only what changed. The stock goes
 * only when it changed, because the server records any stock sent as a
 * correction; the cost goes only when it changed, so the 4-decimal average
 * cost the invoices keep is not rounded away by opening and saving.
 */
export function bodyFor(d: PartDraft, original?: PartData): Record<string, unknown> {
  const creating = !original;
  const all: Record<string, unknown> = {
    name: d.name.trim(),
    sku: d.sku.trim(),
    category: text(d.category, creating),
    brand: text(d.brand, creating),
    model: text(d.model, creating),
    ubication: text(d.ubication, creating),
    provider: text(d.provider, creating),
    description: text(d.description, creating),
    stock: wholeNumber(d.stock) ?? 0,
    minimalStock: wholeNumber(d.minimalStock) ?? 0,
    salesPrice: d.salesPrice ?? (creating ? undefined : 0),
    costPrice: d.costPrice === null ? undefined : String(d.costPrice),
  };
  if (creating) return Object.fromEntries(Object.entries(all).filter(([, v]) => v !== undefined));

  const before = draftFrom(original);
  const changed: Record<string, unknown> = {};
  for (const k of Object.keys(all) as (keyof PartDraft)[]) {
    const same =
      k === "stock" || k === "minimalStock"
        ? wholeNumber(d[k]) === wholeNumber(before[k])
        : typeof d[k] === "string"
          ? (d[k] as string).trim() === (before[k] as string).trim()
          : d[k] === before[k];
    if (!same && all[k] !== undefined) changed[k] = all[k];
  }
  return changed;
}

/** «+2» / «−1» for the stock hint on edit, or null when it did not change. */
export function stockChange(d: PartDraft, original: PartData): number | null {
  const now = wholeNumber(d.stock);
  if (now === null) return null;
  const diff = now - (original.stock ?? 0);
  return diff === 0 ? null : diff;
}
