/** Design 3.5 «Servicios»: the catalog of what is charged, and its form. */

export type Quality = "compatible" | "original" | null;

/** GET /api/services/catalog. */
export interface CatalogRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: string;
  estimatedTime: string | null;
  available: boolean;
  quality: Quality;
  model: { id: string; name: string; brand: string | null } | null;
  /** Partners only. */
  part: { id: string; sku: string; name: string } | null;
}

export const QUALITY_LABEL: Record<"compatible" | "original", string> = {
  compatible: "Compatible",
  original: "Original",
};

/** «iPhone 12 · Compatible», «iPhone 12» or «Todos los modelos». */
export function modelLabel(r: Pick<CatalogRow, "model" | "quality">): string {
  const model = r.model?.name ?? "Todos los modelos";
  return r.quality ? `${model} · ${QUALITY_LABEL[r.quality]}` : model;
}

/** Lower case without accents, so «bateria» finds «Batería». */
export const fold = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Every word typed must be somewhere in the service, its category, model or brand. */
export function filterCatalog(
  rows: CatalogRow[],
  { q, category, hideUnavailable }: { q: string; category: string | null; hideUnavailable: boolean },
): CatalogRow[] {
  const words = fold(q).split(/\s+/).filter(Boolean);
  return rows.filter((r) => {
    if (hideUnavailable && !r.available) return false;
    if (category && (r.category ?? "") !== category) return false;
    if (words.length === 0) return true;
    const haystack = fold(
      [r.name, r.description, r.category, r.model?.name, r.model?.brand, r.quality].filter(Boolean).join(" "),
    );
    return words.every((w) => haystack.includes(w));
  });
}

/** The category chips, by name, with how many services each has. */
export function categoryCounts(rows: CatalogRow[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const r of rows) if (r.category) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b, "es"));
}

/** GET /api/services/:id, the fields the form edits. */
export interface ServiceData {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: string | number;
  estimatedTime: string | null;
  available: boolean;
  modelId: string | null;
  quality: Quality;
  inventoryId: string | null;
}

export interface ServiceDraft {
  name: string;
  description: string;
  category: string;
  price: number | null;
  estimatedTime: string;
  available: boolean;
  modelId: string | null;
  quality: Quality;
  inventoryId: string | null;
}

export type ServiceErrors = Partial<Record<keyof ServiceDraft, string>>;

export const emptyService = (): ServiceDraft => ({
  name: "",
  description: "",
  category: "",
  price: null,
  estimatedTime: "",
  available: true,
  modelId: null,
  quality: null,
  inventoryId: null,
});

export const serviceDraftFrom = (s: ServiceData): ServiceDraft => ({
  name: s.name,
  description: s.description ?? "",
  category: s.category ?? "",
  price: Number.isFinite(Number(s.price)) ? Number(s.price) : null,
  estimatedTime: s.estimatedTime ?? "",
  available: s.available,
  modelId: s.modelId,
  quality: s.quality,
  inventoryId: s.inventoryId,
});

export function validateService(d: ServiceDraft): ServiceErrors {
  const e: ServiceErrors = {};
  if (!d.name.trim()) e.name = "Escribe el nombre del servicio.";
  else if (d.name.trim().length > 100) e.name = "Como mucho 100 caracteres.";
  if (d.price === null) e.price = "Escribe el precio, por ejemplo 59,00.";
  if (d.category.trim().length > 50) e.category = "Como mucho 50 caracteres.";
  if (d.estimatedTime.trim().length > 50) e.estimatedTime = "Como mucho 50 caracteres.";
  return e;
}

/** What is sent for one field: trimmed text, and empty optional text as null. */
function wire(k: keyof ServiceDraft, d: ServiceDraft): unknown {
  const v = d[k];
  if (typeof v !== "string") return k === "price" ? (v ?? 0) : v;
  const t = v.trim();
  // The description column cannot be NULL in the database, so it goes as "".
  return t || k === "description" ? t : null;
}

const FIELDS: (keyof ServiceDraft)[] = [
  "name",
  "description",
  "category",
  "price",
  "estimatedTime",
  "available",
  "modelId",
  "quality",
  "inventoryId",
];

/** POST body for a new service, or PATCH body with only what changed. */
export function serviceBody(d: ServiceDraft, original?: ServiceData): Record<string, unknown> {
  const before = original ? serviceDraftFrom(original) : null;
  const body: Record<string, unknown> = {};
  for (const k of FIELDS) {
    const now = wire(k, d);
    if (before ? now === wire(k, before) : now === null) continue;
    body[k] = now;
  }
  return body;
}
