/** Design R2 3.8 «Catálogo»: brands and models. */

export type DeviceType = "movil" | "tablet" | "computador" | "otro";

export const DEVICE_TYPES: [DeviceType, string][] = [
  ["movil", "Móvil"],
  ["tablet", "Tablet"],
  ["computador", "Ordenador"],
  ["otro", "Otro"],
];

/** GET /api/catalog/models. */
export interface CatalogModel {
  id: string;
  name: string;
  brand: { id: string; name: string } | null;
  deviceType: DeviceType | null;
  active: boolean;
  devices: number;
  rates: number;
  /** Models of the same brand that read the same. */
  duplicates: string[];
}

/** Capitals, accents and spaces do not count, as on the server. */
export function sameName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

/** Each set of look-alike models once, in list order. */
export function duplicateGroups(rows: CatalogModel[]): CatalogModel[][] {
  const seen = new Set<string>();
  const groups: CatalogModel[][] = [];
  for (const row of rows) {
    if (row.duplicates.length === 0 || seen.has(row.id)) continue;
    const ids = new Set([row.id, ...row.duplicates]);
    const group = rows.filter((r) => ids.has(r.id));
    group.forEach((r) => seen.add(r.id));
    groups.push(group);
  }
  return groups;
}

/** «iPhone 13» y «iphone 13». */
export function namesList(rows: { name: string }[]): string {
  const names = rows.map((r) => `«${r.name}»`);
  return names.length < 2
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`;
}

/** Rows whose brand and model contain every word typed. */
export function filterModels(
  rows: CatalogModel[],
  query: string,
): CatalogModel[] {
  const words = query.split(/\s+/).map(sameName).filter(Boolean);
  if (words.length === 0) return rows;
  return rows.filter((r) => {
    const text = sameName(`${r.brand?.name ?? ""} ${r.name}`);
    return words.every((w) => text.includes(w));
  });
}

/** The one kept by default: the most used, then the first listed. */
export function suggestedKeep(group: CatalogModel[]): CatalogModel {
  return group.reduce((best, r) =>
    r.devices + r.rates > best.devices + best.rates ? r : best,
  );
}

const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** What merging moves into the kept model. */
export function mergeSummary(
  keep: CatalogModel,
  group: CatalogModel[],
): string {
  const others = group.filter((r) => r.id !== keep.id);
  const devices = others.reduce((n, r) => n + r.devices, 0);
  const rates = others.reduce((n, r) => n + r.rates, 0);
  return `${namesList(others)} ${others.length === 1 ? "pasa" : "pasan"} a «${keep.name}» con ${count(devices, "equipo", "equipos")} y ${count(rates, "tarifa", "tarifas")}, y ${others.length === 1 ? "desaparece" : "desaparecen"} de la lista.`;
}
