/** «Proveedores › Pedidos»: the orders read from the suppliers' websites. */
import { formatEur } from "@/lib/format";

export type OrderState = "PENDIENTE" | "RECIBIDO" | "DESCARTADO" | "ANTERIOR";

export const STATE_LABEL: Record<OrderState, string> = {
  PENDIENTE: "Pendiente de recibir",
  RECIBIDO: "Recibido",
  DESCARTADO: "Descartado",
  ANTERIOR: "Anterior al ERP",
};

/** The filter's order: what needs doing first. */
export const STATES: OrderState[] = ["PENDIENTE", "RECIBIDO", "DESCARTADO", "ANTERIOR"];

export interface SupplierOrderLine {
  id: string;
  position: number;
  description: string;
  ref: string | null;
  productUrl: string | null;
  quantity: number;
  unitPrice: string | null;
  lineTotal: string | null;
}

/** GET /api/supplier-orders (items) and /api/supplier-orders/:id (with lines). */
export interface SupplierOrder {
  id: string;
  supplierId: string;
  supplier: { id: string; name: string };
  externalId: string;
  reference: string;
  orderDate: string | null;
  total: string | null;
  payment: string | null;
  supplierStatus: string | null;
  invoiceUrl: string | null;
  detailUrl: string;
  state: OrderState;
  linesReadAt: string | null;
  createdAt: string;
  lines?: SupplierOrderLine[];
}

export interface OrderPage {
  items: SupplierOrder[];
  total: number;
  page: number;
  pageSize: number;
  counts: Partial<Record<OrderState, number>>;
}

/** POST /api/suppliers/:id/sync. */
export interface SyncResult {
  added: number;
  updated: number;
  waiting: number;
  firstSync: boolean;
}

/** «2026-11-25» → «25/11/2026». */
export const shortDate = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
export const money = (v: string | null) => (v === null ? "—" : formatEur(Number(v)));

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/** What «Sincronizar» did, in one sentence. */
export function syncSummary(r: SyncResult): string {
  if (r.firstSync) {
    return r.added
      ? `${plural(r.added, "pedido guardado", "pedidos guardados")} como «Anterior al ERP»: ya estaban en su historial. Los que compres a partir de ahora entrarán como pendientes de recibir.`
      : "Su historial está vacío. Los pedidos que compres entrarán como pendientes de recibir.";
  }
  const parts = [
    r.added ? `${plural(r.added, "pedido nuevo", "pedidos nuevos")}, pendientes de recibir` : "Ningún pedido nuevo",
    r.updated ? `${plural(r.updated, "pedido actualizado", "pedidos actualizados")} (estado o factura del proveedor)` : "",
  ].filter(Boolean);
  const rest = r.waiting
    ? ` Quedan ${plural(r.waiting, "pedido", "pedidos")} por traer: vuelve a pulsar «Sincronizar ahora».`
    : "";
  return `${parts.join(". ")}.${rest}`;
}

/** Sum of the lines, to compare with the order's total. */
export function linesTotal(lines: SupplierOrderLine[]): number {
  return lines.reduce((sum, l) => sum + Number(l.lineTotal ?? Number(l.unitPrice ?? 0) * l.quantity), 0);
}
