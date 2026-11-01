/** Design R2 3.7 «Configuración › Tienda»: each store ready to work, without touching code. */
import { formatEur } from "@/lib/format";

export type CommissionType = "percent" | "fixed";

/** GET /api/stores and /api/stores/:id (decimals come as text, hours as "HH:MM:SS"). */
export interface StoreData {
  id: string;
  name: string;
  city: string;
  prefix: string;
  address: string | null;
  phone: string | null;
  legalName: string | null;
  taxId: string | null;
  cashOpensAt: string;
  cashClosesAt: string;
  cashFloat: string;
  warrantyDays: number;
  commissionType: CommissionType | null;
  commissionValue: string | null;
  isMain: boolean;
  nextOrderNumber: number;
  isActive: boolean;
}

/** GET /api/stores/:id/commission-history, newest first. */
export interface CommissionChange {
  id: string;
  type: CommissionType | null;
  value: string | null;
  createdAt: string;
  changedBy: { id: string; fullName: string } | null;
}

/** The legal minimum the server also enforces (RD 58/1988). */
export const MIN_WARRANTY_DAYS = 90;

const day = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

/** «01/09/2026». */
export const formatDay = (iso: string): string => day.format(new Date(iso));

/** Orders already numbered with the store's prefix. */
export const orderCount = (s: Pick<StoreData, "nextOrderNumber">): number => s.nextOrderNumber - 1;

/** «15 %», «8,00 €/equipo» or «sin comisión». */
export function commissionLabel(type: CommissionType | null, value: string | number | null): string {
  if (!type || value === null || value === "") return "sin comisión";
  const n = Number(value);
  return type === "percent"
    ? `${n.toLocaleString("es-ES", { maximumFractionDigits: 2 })} %`
    : `${formatEur(n)}/equipo`;
}

/** The example under the commission: what a 129,00 € repair leaves to the store. */
export function commissionExample(type: CommissionType | null, value: number | null): string | null {
  if (!type || value === null) return null;
  const amount = type === "percent" ? Math.round(129 * value) / 100 : value;
  return `Ejemplo: una reparación de ${formatEur(129)} cobrada genera ${formatEur(amount)} de comisión.`;
}

export interface StoreDraft {
  name: string;
  city: string;
  prefix: string;
  address: string;
  phone: string;
  legalName: string;
  taxId: string;
  /** "HH:MM". */
  cashOpensAt: string;
  cashClosesAt: string;
  cashFloat: number | null;
  warrantyDays: string;
  commissionType: CommissionType | null;
  commissionValue: number | null;
}

export const emptyStore = (): StoreDraft => ({
  name: "",
  city: "",
  prefix: "",
  address: "",
  phone: "",
  legalName: "",
  taxId: "",
  cashOpensAt: "09:00",
  cashClosesAt: "20:00",
  cashFloat: 0,
  warrantyDays: String(MIN_WARRANTY_DAYS),
  commissionType: "percent",
  commissionValue: null,
});

export const storeDraftFrom = (s: StoreData): StoreDraft => ({
  name: s.name,
  city: s.city,
  prefix: s.prefix,
  address: s.address ?? "",
  phone: s.phone ?? "",
  legalName: s.legalName ?? "",
  taxId: s.taxId ?? "",
  cashOpensAt: s.cashOpensAt.slice(0, 5),
  cashClosesAt: s.cashClosesAt.slice(0, 5),
  cashFloat: Number(s.cashFloat),
  warrantyDays: String(s.warrantyDays),
  commissionType: s.commissionType,
  commissionValue: s.commissionValue === null ? null : Number(s.commissionValue),
});

export type StoreErrors = Partial<Record<keyof StoreDraft, string>>;

const HOUR = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Same rules as the server, said where the mistake is. */
export function validateStore(d: StoreDraft, isMain: boolean): StoreErrors {
  const e: StoreErrors = {};
  if (d.name.trim().length < 2) e.name = "Escribe el nombre de la tienda.";
  if (d.city.trim().length < 2) e.city = "Escribe la ciudad.";
  if (!/^[A-Za-z]{2,4}$/.test(d.prefix.trim()))
    e.prefix = "De 2 a 4 letras, por ejemplo VC.";
  if (!HOUR.test(d.cashOpensAt)) e.cashOpensAt = "Escribe la hora como 09:00.";
  if (!HOUR.test(d.cashClosesAt)) e.cashClosesAt = "Escribe la hora como 20:00.";
  else if (HOUR.test(d.cashOpensAt) && d.cashClosesAt <= d.cashOpensAt)
    e.cashClosesAt = "La hora de cierre debe ser posterior a la de apertura.";
  if (d.cashFloat === null) e.cashFloat = "Escribe el fondo inicial, aunque sea 0,00.";
  const days = Number(d.warrantyDays);
  if (!Number.isInteger(days) || days < MIN_WARRANTY_DAYS)
    e.warrantyDays = `Al menos ${MIN_WARRANTY_DAYS} días: es el mínimo legal.`;
  if (!isMain && d.commissionType) {
    if (d.commissionValue === null) e.commissionValue = "Escribe el valor de la comisión.";
    else if (d.commissionType === "percent" && d.commissionValue > 100)
      e.commissionValue = "El porcentaje no puede pasar de 100.";
  }
  return e;
}

/**
 * What to send. Creating sends everything; editing only what changed, so an
 * untouched commission never adds a line to its history.
 */
export function storeBody(d: StoreDraft, original?: StoreDraft, isMain = false): Record<string, unknown> {
  const all: Record<string, unknown> = {
    name: d.name.trim(),
    city: d.city.trim(),
    prefix: d.prefix.trim().toUpperCase(),
    address: d.address.trim(),
    phone: d.phone.trim(),
    legalName: d.legalName.trim(),
    taxId: d.taxId.trim(),
    cashOpensAt: d.cashOpensAt,
    cashClosesAt: d.cashClosesAt,
    cashFloat: d.cashFloat,
    warrantyDays: Number(d.warrantyDays),
  };
  if (!isMain) {
    all.commissionType = d.commissionType;
    all.commissionValue = d.commissionType ? d.commissionValue : null;
  }
  if (!original) return all;
  const before = storeBody(original, undefined, isMain);
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith("commission")) continue;
    if (v !== before[k]) body[k] = v;
  }
  // Type and value always travel together.
  if (!isMain && (all.commissionType !== before.commissionType || all.commissionValue !== before.commissionValue)) {
    body.commissionType = all.commissionType;
    body.commissionValue = all.commissionValue;
  }
  return body;
}
