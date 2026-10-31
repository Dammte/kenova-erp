/** GET /api/inventory/list (design 3.4 «Repuestos»). */
export type StockStatus = "out" | "low" | "ok";

export interface PartRow {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  brand: string | null;
  model: string | null;
  ubication: string | null;
  provider: string | null;
  stock: number;
  minimalStock: number;
  status: StockStatus;
  salesPrice: string | null;
  costPrice: string | null;
}

export interface PartPage {
  total: number;
  page: number;
  pageSize: number;
  rows: PartRow[];
  counts: { all: number; low: number; byCategory: Record<string, number> };
  brands: string[];
  providers: string[];
}

/** GET /api/inventory/:id/movements. */
export interface StockLine {
  id: string;
  kind: "initial" | "purchase" | "order" | "adjust";
  quantity: number;
  stockAfter: number;
  note: string | null;
  orderId: string | null;
  orderCode: string | null;
  userName: string | null;
  createdAt: string;
}

export const MOVE_LABEL: Record<StockLine["kind"], string> = {
  initial: "Alta",
  purchase: "Entrada",
  order: "Uso",
  adjust: "Ajuste",
};

/** «Sin stock», «Bajo · mín. 3» or «En stock»: never the colour alone. */
export function stockLabel(p: { status: StockStatus; minimalStock: number }): string {
  if (p.status === "out") return "Sin stock";
  if (p.status === "low") return `Bajo · mín. ${p.minimalStock}`;
  return "En stock";
}

/** How full the bar is: the minimum sits at half. */
export const stockFill = (stock: number, minimal: number): number =>
  minimal > 0 ? Math.min(100, Math.round((stock / (minimal * 2)) * 100)) : stock > 0 ? 100 : 0;

/** «PAN» for the thumbnail: the SKU's first part. */
export const skuTag = (sku: string): string => sku.split("-")[0].slice(0, 3).toUpperCase();

/** Margin on the sale price, «52 %», or «—» without a sale price. */
export function margin(sale: string | null, cost: string | null): string {
  const s = Number(sale);
  if (!sale || !s) return "—";
  return `${Math.round(((s - Number(cost ?? 0)) / s) * 100)} %`;
}

/** «+4» / «−1» with a real minus sign. */
export const signed = (n: number): string => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);

/** GET /api/part-orders (design 3.4 «Pedidos»). */
export interface PartOrderRow {
  id: string;
  orderId: string;
  orderCode: string;
  orderStatus: string;
  assignedTo: string | null;
  inventoryId: string | null;
  partName: string;
  provider: string | null;
  quantity: number;
  orderedAt: string;
  expectedAt: string | null;
  receivedAt: string | null;
  receivedBy: string | null;
  waitingDays: number;
  late: boolean;
}

/** «31/10/2026» from «2026-10-31». */
export const formatDate = (day: string): string => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

/** «Sin fecha · 9 días», «31/10/2026» or «31/10/2026 · 2 días tarde». */
export function arrival(p: Pick<PartOrderRow, "expectedAt" | "waitingDays" | "late">): string {
  const days = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;
  if (!p.expectedAt) return `Sin fecha · ${days(p.waitingDays)}`;
  return p.late ? `${formatDate(p.expectedAt)} · retrasado` : formatDate(p.expectedAt);
}
