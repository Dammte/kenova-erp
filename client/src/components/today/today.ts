/** GET /api/today (design 3.1). */
export interface List<T> {
  total: number;
  rows: T[];
}
export interface TodaySummary {
  date: string;
  counts: {
    received: number;
    receivedLastWeek: number;
    inProgress: number;
    inProgressUrgent: number;
    waitingParts: number;
    waitingPartsLate: number;
    ready: number;
    readyNotNotified: number;
    collectedToday: string;
    pendingBalance: string;
  };
  toNotify: List<{ id: string; code: string; clientName: string; model: string | null; days: number }>;
  lateParts: List<{ id: string; code: string; clientName: string; model: string | null; days: number }>;
  uncollected: List<{
    id: string;
    code: string;
    clientName: string;
    phone: string | null;
    model: string | null;
    days: number;
    balance: string;
    notices: number;
  }>;
  lowStock: List<{ id: string; sku: string; name: string; stock: number; minimalStock: number }> | null;
  week: { day: string; received: number; delivered: number }[];
  openByStatus: Record<"en_progreso" | "pendiente_cliente" | "pendiente_piezas" | "finalizado", number>;
}

const WEEKDAY = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

/** «2 más que el jueves pasado», «igual que…», «1 menos que…». */
export function versusLastWeek(today: number, lastWeek: number, date: string): string {
  const name = `el ${WEEKDAY[weekday(date)]} pasado`;
  const diff = today - lastWeek;
  if (diff === 0) return `Igual que ${name}`;
  return `${Math.abs(diff)} ${diff > 0 ? "más" : "menos"} que ${name}`;
}

/** «Lun» … and «Hoy» for the last day. */
export const dayLabel = (iso: string, isToday: boolean) => (isToday ? "Hoy" : SHORT[weekday(iso)]);

/** «Jueves, 29/10/2026». */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const name = WEEKDAY[weekday(iso)];
  return `${name[0].toUpperCase()}${name.slice(1)}, ${d}/${m}/${y}`;
}

/** «hoy», «ayer», «hace 3 días». */
export const ago = (days: number) => (days <= 0 ? "hoy" : days === 1 ? "ayer" : `hace ${days} días`);
