import { formatEur } from "@/lib/format";

/** GET /api/cash/day (design 3.2). */
export type CashMethod = "cash" | "card" | "transfer" | "other";
export interface CashLine {
  id: string;
  kind: "charge" | "refund" | "in" | "out";
  at: string;
  offHours: boolean;
  method: CashMethod;
  amount: string;
  note: string | null;
  orderId: string | null;
  orderCode: string | null;
  clientName: string | null;
  userName: string | null;
}
export interface CashDay {
  store: { id: string; name: string; opensAt: string; closesAt: string };
  date: string;
  status: "open" | "closed";
  byMethod: Record<CashMethod, { amount: string; count: number }>;
  total: string;
  cash: { float: string; charges: string; refunds: string; manual: string; expected: string };
  count: { cash: string | null; terminal: string | null; note: string | null; countedBy: string | null; countedAt: string } | null;
  movements: CashLine[];
}

export const METHOD_LABEL: Record<CashMethod, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  other: "Otro",
};
export const KIND_LABEL: Record<CashLine["kind"], string> = {
  charge: "Cobro",
  refund: "Devolución",
  in: "Entrada",
  out: "Salida",
};
export type Filter = "all" | "charge" | "refund" | "manual";
export const matches = (line: CashLine, filter: Filter) =>
  filter === "all" || (filter === "manual" ? line.kind === "in" || line.kind === "out" : line.kind === filter);

const SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** The date `days` before an ISO date (yyyy-mm-dd). */
export function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** «Hoy · vie 30/10», «Jue 29/10». */
export function dayChip(iso: string, today: string): string {
  const name = SHORT[new Date(`${iso}T12:00:00Z`).getUTCDay()];
  return iso === today ? `Hoy · ${name} ${dm(iso)}` : `${name[0].toUpperCase()}${name.slice(1)} ${dm(iso)}`;
}

/** Local time (Spain) of a movement; the date too when it is not the cash day's own. */
export function lineTime(line: CashLine, day: string): string {
  const at = new Date(line.at);
  const date = at.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
  const time = at.toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
  return date === day ? time : `${dm(date)} ${time}`;
}

/** «Fuera de horario · cobrado el 29/10 a las 21:20». */
export function offHoursNote(line: CashLine): string {
  const at = new Date(line.at);
  const date = at.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
  const time = at.toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
  return `Fuera de horario · ${line.kind === "refund" ? "devuelto" : line.kind === "charge" ? "cobrado" : "anotado"} el ${dm(date)} a las ${time}`;
}

/** Informative differences of a count; they never block anything. */
export function countDifferences(day: CashDay): string[] {
  const out: string[] = [];
  const cents = (v: string) => Math.round(Number(v) * 100);
  if (day.count?.cash != null) {
    const diff = cents(day.count.cash) - cents(day.cash.expected);
    out.push(
      diff === 0
        ? "El efectivo cuadra."
        : diff < 0
          ? `Faltan ${formatEur(-diff / 100)} en efectivo.`
          : `Sobran ${formatEur(diff / 100)} en efectivo.`,
    );
  }
  if (day.count?.terminal != null) {
    const diff = cents(day.count.terminal) - cents(day.byMethod.card.amount);
    out.push(
      diff === 0
        ? "El datáfono cuadra con los cobros con tarjeta."
        : `El datáfono marca ${formatEur(Math.abs(diff) / 100)} ${diff > 0 ? "más" : "menos"} que los cobros con tarjeta.`,
    );
  }
  return out;
}
