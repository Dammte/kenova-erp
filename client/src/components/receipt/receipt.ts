import { METHOD_LABEL, type OrderDetail, type OrderPayment } from "@/components/orders/orderDetail";

/** GET /api/stores/:id, the fields the printouts use. */
export interface ReceiptStore {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  legalName: string | null;
  taxId: string | null;
  warrantyDays: number;
}

export type ReceiptFormat = "ticket" | "a4";

/** Design 4: the quote stays valid this long from the receipt's date. */
export const QUOTE_DAYS = 30;

const n = (v: string | number | null | undefined) => Number(v ?? 0);

/** Header lines under the brand; empty data is left out, never printed blank. */
export function storeLines(store: ReceiptStore | null, format: ReceiptFormat): string[] {
  if (!store) return [];
  const legal = [store.legalName, store.taxId && `NIF ${store.taxId}`].filter(Boolean).join(" · ");
  const contact = [store.address, store.phone && `Tel. ${store.phone}`].filter(Boolean).join(" · ");
  return [format === "a4" ? legal : "", contact].filter(Boolean);
}

/** Total, what was paid on account and how, and what is still owed. */
export function receiptMoney(order: OrderDetail, payments: OrderPayment[]) {
  const total = n(order.totalPrice);
  const paid = n(order.amountPaid);
  const methods = [...new Set(payments.filter((p) => p.kind === "charge").map((p) => METHOD_LABEL[p.method]))];
  return { total, paid, pending: Math.max(0, n(order.balance ?? total - paid)), methods };
}

/** "Lucía Fernández O." on the narrow ticket, the full name on A4. */
export function clientName(c: OrderDetail["client"], format: ReceiptFormat): string {
  const last = (c.lastName ?? "").trim();
  if (!last) return c.firstName;
  if (format === "a4") return `${c.firstName} ${last}`;
  const [first, ...rest] = last.split(/\s+/);
  return [c.firstName, first, ...rest.map((w) => `${w[0]}.`)].join(" ");
}
