/** POST /api/purchase-invoices/read and /preview (design 3.4 «Importar factura»). */
export interface ReadLine {
  description: string;
  ref: string | null;
  quantity: number;
  unitCost: string;
}

export interface ReadInvoice {
  provider: string | null;
  number: string | null;
  invoiceDate: string | null;
  lines: ReadLine[];
}

export interface MatchedPart {
  id: string;
  sku: string;
  name: string;
  stock: number;
  costPrice: string | null;
}

export type LineMatch =
  | { kind: "match"; reason: "ref" | "sku" | "name"; part: MatchedPart }
  | { kind: "similar"; score: number; part: MatchedPart }
  | { kind: "new" };

export interface Preview {
  duplicateOf: { importedAt: string; by: string | null } | null;
  lines: { match: LineMatch; waiting: { partOrderId: string; orderId: string; orderCode: string; quantity: number }[] }[];
}

/** What the partner decided for a line in «Revisar». */
export type Decision = { to: "part"; part: MatchedPart } | { to: "new"; name: string } | { to: "undecided" };

/** A line in the review: what the invoice says, its match and the decision. */
export interface ReviewLine extends ReadLine {
  key: number;
  match: LineMatch;
  waiting: Preview["lines"][number]["waiting"];
  decision: Decision;
  /** Quantity and cost as typed (Spanish decimals allowed). */
  qtyText: string;
  costText: string;
}

/** Only a sure match decides itself; a similar one waits for the partner. */
export function initialDecision(line: ReadLine, match: LineMatch): Decision {
  if (match.kind === "match") return { to: "part", part: match.part };
  if (match.kind === "new") return { to: "new", name: tidyName(line.description) };
  return { to: "undecided" };
}

/** «BATERIA IPHONE 13 3240MAH» → «Bateria iphone 13 3240mah»: a starting name for a new part. */
export const tidyName = (s: string): string => {
  const t = s.trim().replace(/\s+/g, " ").slice(0, 100);
  return t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t;
};

export const parseQty = (s: string): number | null => (/^\d{1,6}$/.test(s.trim()) && Number(s) >= 1 ? Number(s) : null);

/** «18,50» or «18.5» → «18.5»; null when it is not a price. */
export function parseCost(s: string): string | null {
  const t = s.trim().replace(/\s|€/g, "").replace(",", ".");
  return /^\d{1,8}(\.\d{1,4})?$/.test(t) ? String(Number(t)) : null;
}

/** Why «Revisar entrada» is not available yet, or undefined when it is. */
export function reviewBlocker(lines: ReviewLine[], duplicate: boolean, duplicateAccepted: boolean): string | undefined {
  if (lines.length === 0) return "No queda ninguna línea.";
  if (duplicate && !duplicateAccepted) return "Decide si importar otra vez esta factura.";
  const similar = lines.filter((l) => l.decision.to === "undecided").length;
  if (similar) return `Resuelve ${similar === 1 ? "la línea similar" : `las ${similar} líneas similares`}.`;
  if (lines.some((l) => parseQty(l.qtyText) === null)) return "Revisa las cantidades.";
  if (lines.some((l) => parseCost(l.costText) === null)) return "Revisa los costes.";
  if (lines.some((l) => l.decision.to === "new" && !l.decision.name.trim())) return "Pon nombre a los repuestos nuevos.";
  return undefined;
}

/** The body of POST /api/purchase-invoices. */
export function confirmBody(
  head: { provider: string; number: string; invoiceDate: string | null },
  lines: ReviewLine[],
  allowDuplicate: boolean,
) {
  return {
    provider: head.provider.trim(),
    number: head.number.trim() || null,
    invoiceDate: head.invoiceDate,
    allowDuplicate,
    lines: lines.map((l) => ({
      description: l.description,
      ref: l.ref,
      quantity: parseQty(l.qtyText),
      unitCost: parseCost(l.costText),
      ...(l.decision.to === "part"
        ? { inventoryId: l.decision.part.id }
        : { newPart: { name: l.decision.to === "new" ? l.decision.name.trim() : l.description } }),
    })),
  };
}

/** The confirmation's figures: parts that go up, parts created, units and cost. */
export function summary(lines: ReviewLine[]) {
  return {
    raised: lines.filter((l) => l.decision.to === "part").length,
    created: lines.filter((l) => l.decision.to === "new").length,
    units: lines.reduce((n, l) => n + (parseQty(l.qtyText) ?? 0), 0),
    cost: lines.reduce((n, l) => n + (parseQty(l.qtyText) ?? 0) * Number(parseCost(l.costText) ?? 0), 0),
  };
}

/** POST /api/purchase-invoices result. */
export interface Confirmed {
  invoiceId: string;
  units: number;
  cost: string;
  lines: {
    inventoryId: string;
    name: string;
    created: boolean;
    stockBefore: number;
    stockAfter: number;
    costPrice: string;
    received: { orderId: string; orderCode: string }[];
  }[];
}
