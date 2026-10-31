/** Design 2.4: shapes of /api/quotes and the pure helpers of the screen. */

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";
export type QuoteTab = "all" | QuoteStatus;
export type Quality = "compatible" | "original";

export interface QuoteRow {
  id: string;
  code: string;
  status: QuoteStatus;
  clientName: string;
  clientPhone: string;
  device: string;
  total: string;
  validUntil: string;
  createdAt: string;
}

export interface QuoteListPage {
  rows: QuoteRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<QuoteTab, number>;
}

export interface QuoteLine {
  id?: string;
  serviceId: string | null;
  description: string;
  quality: Quality | null;
  unitPrice: string;
}

export interface QuoteDetail {
  id: string;
  code: string;
  status: QuoteStatus;
  clientId: string | null;
  clientName: string;
  clientPhone: string;
  brand: string | null;
  model: string;
  fault: string | null;
  total: string;
  diagnosticFee: string | null;
  validUntil: string;
  sentAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  createdBy: { fullName: string } | null;
  order: { id: string; code: string } | null;
  lines: QuoteLine[];
}

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Borrador",
  sent: "Enviado",
  accepted: "Aceptado",
  rejected: "Rechazado",
  expired: "Caducado",
};

export const QUOTE_TABS: { tab: QuoteTab; label: string }[] = [
  { tab: "all", label: "Todos" },
  { tab: "draft", label: "Borrador" },
  { tab: "sent", label: "Enviado" },
  { tab: "accepted", label: "Aceptado" },
  { tab: "rejected", label: "Rechazado" },
  { tab: "expired", label: "Caducado" },
];

export const QUALITY_LABEL: Record<Quality, string> = { compatible: "Compatible", original: "Original" };

/** "2026-11-27" as "27/11/2026". */
export function formatDay(date: string): string {
  const [y, m, d] = date.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Today in Spain (YYYY-MM-DD), the day the server counts validity with. */
export function todayInSpain(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Days until the last valid day: 0 on that day, negative once expired. */
export function daysLeft(validUntil: string, today: string = todayInSpain()): number {
  return Math.round((Date.parse(`${validUntil}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** "Válido hasta 27/11/2026 · 29 días", as on the design's detail. */
export function validityText(q: Pick<QuoteDetail, "status" | "validUntil">, today?: string): string {
  const until = formatDay(q.validUntil);
  if (q.status === "expired") return `Caducó el ${until}`;
  if (q.status !== "draft" && q.status !== "sent") return `Válido hasta ${until}`;
  const n = daysLeft(q.validUntil, today);
  return `Válido hasta ${until} · ${n === 0 ? "último día" : n === 1 ? "1 día" : `${n} días`}`;
}

/** Sum of the lines in cents, so the total shown while editing never drifts. */
export function linesTotal(lines: { unitPrice: number | null }[]): number {
  return lines.reduce((s, l) => s + Math.round((l.unitPrice ?? 0) * 100), 0) / 100;
}
