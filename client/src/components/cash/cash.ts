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

/** GET /api/cash/week (design 3.2 «Semana»). */
export interface CashWeek {
  store: CashDay["store"];
  from: string;
  to: string;
  days: {
    date: string;
    status: "open" | "closed";
    byMethod: Record<CashMethod, string>;
    total: string;
    manual: string;
    movements: number;
    counted: boolean;
  }[];
  byMethod: Record<CashMethod, string>;
  total: string;
  manual: string;
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

/** «Semana del 26/10 al 01/11». */
export const weekLabel = (from: string, to: string) => `Semana del ${dm(from)} al ${dm(to)}`;

/** What a day of the week says about itself. */
export function weekDayState(day: CashWeek["days"][number]): string {
  if (day.status === "open") return "En curso";
  if (day.movements === 0) return "Sin movimientos";
  return day.counted ? "Cerrado · con recuento" : "Cerrado · sin recuento";
}

export const FILTER_LABEL: Record<Filter, string> = {
  all: "Todos",
  charge: "Cobros",
  refund: "Devoluciones",
  manual: "Entradas y salidas",
};

const money = (v: string) => Math.round(Number(v) * 100) / 100;
const fileSafe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "").trim();

/** «Caja_Medina de Pomar_2026-11-12.xlsx», «…_2026-11-12_cobros.xlsx», «…_semana_2026-11-09.xlsx». */
export function cashFileName(storeName: string, from: string, kind: "day" | "week", filter: Filter = "all"): string {
  const suffix = filter === "all" ? "" : `_${FILTER_LABEL[filter].toLowerCase().replace(/ /g, "-")}`;
  return `Caja_${fileSafe(storeName)}_${kind === "week" ? "semana_" : ""}${from}${suffix}.xlsx`;
}

/**
 * The day's sheet: the movements the filter shows, amounts as numbers so
 * they add up in Excel, then the whole day's totals (they ignore the filter,
 * as the tiles on screen do).
 */
export function dayExportRows(day: CashDay, filter: Filter): (string | number)[][] {
  const methods: CashMethod[] = ["cash", "card", "transfer", "other"];
  const rows: (string | number)[][] = [
    ["Hora", "Tipo", "Orden", "Cliente", "Nota", "Forma", "Usuario", "Importe (€)"],
    ...day.movements
      .filter((m) => matches(m, filter))
      .map((m) => [
        lineTime(m, day.date),
        KIND_LABEL[m.kind],
        m.orderCode ?? "",
        m.clientName ?? "",
        m.note ?? "",
        METHOD_LABEL[m.method],
        m.userName ?? "",
        money(m.amount),
      ]),
    [],
    ...methods.map((m) => [METHOD_LABEL[m], "", "", "", "", "", "", money(day.byMethod[m].amount)]),
    ["Total cobrado", "", "", "", "", "", "", money(day.total)],
    ["Entradas y salidas", "", "", "", "", "", "", money(day.cash.manual)],
    ["Efectivo esperado", "", "", "", "", "", "", money(day.cash.expected)],
  ];
  if (day.count?.cash != null) rows.push(["Efectivo contado", "", "", "", "", "", "", money(day.count.cash)]);
  if (day.count?.terminal != null) rows.push(["Datáfono", "", "", "", "", "", "", money(day.count.terminal)]);
  return rows;
}

/** The week's sheet: one row per cash day, then the week. */
export function weekExportRows(week: CashWeek): (string | number)[][] {
  const methods: CashMethod[] = ["cash", "card", "transfer", "other"];
  return [
    ["Día", ...methods.map((m) => `${METHOD_LABEL[m]} (€)`), "Total cobrado (€)", "Entradas y salidas (€)", "Estado"],
    ...week.days.map((d) => [
      `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}/${d.date.slice(0, 4)}`,
      ...methods.map((m) => money(d.byMethod[m])),
      money(d.total),
      money(d.manual),
      weekDayState(d),
    ]),
    ["Semana", ...methods.map((m) => money(week.byMethod[m])), money(week.total), money(week.manual), ""],
  ];
}
