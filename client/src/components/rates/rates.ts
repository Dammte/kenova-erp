import { formatEur } from "@/lib/format";

/** GET /api/services/rates: one price list entry. */
export interface RateRow {
  id: string;
  name: string;
  category: string | null;
  price: string;
  estimatedTime: string | null;
  quality: "compatible" | "original" | null;
  model: { id: string; name: string; brand: string | null } | null;
  /** Only for partners; null when hidden or no part is linked. */
  stock: { units: number; low: boolean } | null;
}

/** One repair for one model, with its compatible and original prices. */
export interface RateGroup {
  key: string;
  /** "Cambio de pantalla"; the category, or the service name when there is none. */
  repair: string;
  model: RateRow["model"];
  compatible: RateRow | null;
  original: RateRow | null;
  /** A rate with no quality (a check-up, a cleaning). */
  single: RateRow | null;
  estimatedTime: string | null;
}

/** Design 2.3: rows of the same model and repair go together, compatible beside original. */
export function groupRates(rows: RateRow[]): RateGroup[] {
  const groups = new Map<string, RateGroup>();
  for (const r of rows) {
    const repair = r.category?.trim() || r.name;
    const key = `${r.model?.id ?? "-"}|${repair.toLowerCase()}`;
    const g =
      groups.get(key) ??
      ({ key, repair, model: r.model, compatible: null, original: null, single: null, estimatedTime: null } as RateGroup);
    const slot = r.quality ?? "single";
    if (!g[slot]) g[slot] = r;
    g.estimatedTime ??= r.estimatedTime;
    groups.set(key, g);
  }
  return [...groups.values()];
}

/** Which price the WhatsApp text quotes. */
export type Choice = "both" | "compatible" | "original";

/** What a group can offer: "both" only when it has both qualities. */
export function choicesFor(g: RateGroup): Choice[] {
  if (g.compatible && g.original) return ["both", "compatible", "original"];
  if (g.compatible) return ["compatible"];
  if (g.original) return ["original"];
  return [];
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const money = (r: RateRow) => formatEur(Number(r.price));

/** True when the part of the quoted price is on the shelf (partners only know it). */
function inStock(rows: (RateRow | null)[]): boolean {
  return rows.some((r) => r?.stock && r.stock.units > 0);
}

/**
 * The message pasted into WhatsApp. Design 2.3 with the "Precio" template; the
 * 30 days come from RD 58/1988. Never mentions stock counts, only "puede estar hoy".
 */
export function whatsappText(g: RateGroup, choice: Choice, validDays = 30): string {
  // "Batería" or "Cambio de pantalla" have different genders: no article needed.
  const intro = g.model ? `Hola, te paso el precio para tu ${g.model.name}` : "Hola, te paso el precio";
  let price: string;
  let quoted: (RateRow | null)[];
  if (choice === "both" && g.compatible && g.original) {
    price = `${money(g.compatible)} con pieza compatible o ${money(g.original)} con original`;
    quoted = [g.compatible, g.original];
  } else {
    const r =
      (choice === "original" ? g.original : choice === "compatible" ? g.compatible : null) ??
      g.single ??
      g.compatible ??
      g.original;
    price = r ? `${money(r)}${r.quality ? ` con pieza ${r.quality}` : ""}` : "";
    quoted = [r];
  }
  const lines = [
    `${intro}: ${lower(g.repair)}, ${price}.`,
    g.estimatedTime ? `Tiempo estimado: ${g.estimatedTime}.` : "",
    inStock(quoted) ? "Tenemos la pieza: puede estar hoy." : "",
  ].filter(Boolean);
  return `${lines.join(" ")}\nPrecio válido ${validDays} días.\nKenova`;
}

const RECENT_KEY = "kenova.ratesRecent";
const RECENT_MAX = 5;

/** The last searches, newest first; a convenience, so failures are silent. */
export function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecent(list: string[], query: string): string[] {
  const q = query.trim();
  if (q.length < 2) return list;
  const next = [q, ...list.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Only a convenience.
  }
  return next;
}
