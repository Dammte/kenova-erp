import { fold } from '../../common/text-search';

/** Words suppliers abbreviate; the key is how the invoice writes it. */
const SYNONYMS: Record<string, string> = {
  bat: 'bateria',
  battery: 'bateria',
  pantalla: 'pantalla',
  lcd: 'pantalla',
  display: 'pantalla',
  screen: 'pantalla',
  conector: 'conector',
  connector: 'conector',
  ip: 'iphone',
  sam: 'samsung',
  sg: 'galaxy',
};
/** Words that say nothing about which part it is. */
const NOISE = new Set([
  'de',
  'del',
  'la',
  'el',
  'para',
  'con',
  'x',
  'ud',
  'uds',
  'gen',
]);

/**
 * The words of a part name, folded: «BAT IP13 3240MAH» and «Batería iPhone 13»
 * share «bateria», «iphone» and «13».
 */
export function words(text: string): string[] {
  const out: string[] = [];
  for (const raw of fold(text).split(/[^a-z0-9]+/)) {
    if (!raw || NOISE.has(raw)) continue;
    // «ip13» is «iphone 13»; «a54» stays a model code.
    const ip = /^ip(\d{1,2})$/.exec(raw);
    if (ip) {
      out.push('iphone', ip[1]);
      continue;
    }
    out.push(SYNONYMS[raw] ?? raw);
  }
  return [...new Set(out)];
}

const numbers = (ws: string[]) => ws.filter((w) => /^\d{1,3}$/.test(w));

/**
 * How alike an invoice line and a part are, 0 to 1 (Dice over the words).
 * Different model numbers («13» against «12») halve it: they are different parts.
 */
export function similarity(line: string, part: string): number {
  const a = words(line);
  const b = words(part);
  if (!a.length || !b.length) return 0;
  const shared = a.filter((w) => b.includes(w)).length;
  let score = (2 * shared) / (a.length + b.length);
  const na = numbers(a);
  const nb = numbers(b);
  if (na.length && nb.length && !na.some((n) => nb.includes(n))) score /= 2;
  return Math.round(score * 100) / 100;
}

/** Below this a part is not offered as «Similar a…». */
export const SIMILAR_FROM = 0.5;

export interface Candidate {
  id: string;
  sku: string;
  name: string;
  model?: string | null;
}

export type LineMatch =
  | { kind: 'match'; part: Candidate; reason: 'ref' | 'sku' | 'name' }
  | { kind: 'similar'; part: Candidate; score: number }
  | { kind: 'new' };

/**
 * Design 3.4: «Coincide» only when it is certain (the supplier's reference was
 * linked to the part in an earlier invoice, it is the part's SKU, or the name is
 * the same); a name that is merely alike is «Similar a…» and needs a decision.
 */
export function matchLine(
  line: { description: string; ref?: string | null },
  parts: Candidate[],
  remembered: Map<string, string>,
): LineMatch {
  const ref = line.ref?.trim().toLowerCase();
  if (ref) {
    const id = remembered.get(ref);
    const linked = id && parts.find((p) => p.id === id);
    if (linked) return { kind: 'match', part: linked, reason: 'ref' };
    const bySku = parts.find((p) => p.sku.toLowerCase() === ref);
    if (bySku) return { kind: 'match', part: bySku, reason: 'sku' };
  }
  const key = words(line.description).sort().join(' ');
  const same = parts.find((p) => words(p.name).sort().join(' ') === key);
  if (same) return { kind: 'match', part: same, reason: 'name' };

  let best: { part: Candidate; score: number } | null = null;
  for (const part of parts) {
    const score = similarity(
      line.description,
      [part.name, part.model].filter(Boolean).join(' '),
    );
    if (score >= SIMILAR_FROM && (!best || score > best.score)) {
      best = { part, score };
    }
  }
  return best ? { kind: 'similar', ...best } : { kind: 'new' };
}

/**
 * Weighted average cost after buying `quantity` units at `unitCost`
 * (decision 2026-10-31). Units owed (negative stock) or a part without cost
 * take the new cost.
 */
export function averageCost(
  stock: number | null | undefined,
  cost: string | number | null | undefined,
  quantity: number,
  unitCost: string | number,
): string {
  const have = Math.max(0, Number(stock ?? 0));
  const old = Number(cost ?? 0);
  const price = Number(unitCost);
  if (have === 0 || !old) return price.toFixed(4);
  return ((have * old + quantity * price) / (have + quantity)).toFixed(4);
}
