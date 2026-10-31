import type { OrderStatus } from "@/components/ui";

/** GET /api/clients/list (design 3.3). */
export interface ClientRow {
  id: string;
  firstName: string;
  lastName: string | null;
  phoneNumber: string | null;
  dniType: string;
  dni: string | null;
  orders: number;
  lastVisit: string | null;
  balance: string;
  duplicate: boolean;
}
export interface ClientPage {
  total: number;
  page: number;
  pageSize: number;
  rows: ClientRow[];
}

/** GET /api/clients/:id. */
export interface ClientData {
  id: string;
  firstName: string;
  lastName: string | null;
  phoneNumber: string | null;
  dniType: string;
  dni: string | null;
  email: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  isActive: boolean;
  createdAt: string;
}

/** GET /api/clients/:id/summary. */
export interface ClientSummary {
  stats: { orders: number; spent: string; balance: string; open: number; lastVisit: string | null };
  devices: { id: string; type: string; brand: string; model: string; imei: string | null; orders: number }[];
  history: {
    total: number;
    rows: {
      id: string;
      code: string;
      model: string | null;
      faults: string[];
      date: string;
      status: OrderStatus;
      totalPrice: string;
    }[];
  };
}

/** GET /api/clients/:id/duplicates. */
export interface DuplicateOf extends Omit<ClientData, "isActive" | "createdAt"> {
  orders: number;
  firstVisit: string | null;
  samePhone: boolean;
}

export const DOC_LABEL: Record<string, string> = { NIF: "NIF", NIE: "NIE", PASSPORT: "Pasaporte", CIF: "CIF" };

export const fullName = (c: { firstName: string; lastName: string | null }) =>
  [c.firstName, c.lastName].filter(Boolean).join(" ");

/** «LF» for the avatar. */
export const initials = (c: { firstName: string; lastName: string | null }) =>
  `${c.firstName[0] ?? ""}${c.lastName?.[0] ?? ""}`.toUpperCase();

/** «612 345 678» for a Spanish nine-digit phone; anything else as typed. */
export function formatPhone(phone: string | null): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  return digits.length === 9 ? `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}` : phone;
}

/** «NIF 12345678Z», or «—». */
export const formatDoc = (c: { dniType: string; dni: string | null }) =>
  c.dni ? `${DOC_LABEL[c.dniType] ?? c.dniType} ${c.dni}` : "—";

/** «29/10/2026». */
export const formatDay = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

const LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

/** The NIF/NIE control letter check; null when it is right or not checkable. */
export function documentProblem(type: string, doc: string | null): string | null {
  if (!doc || (type !== "NIF" && type !== "NIE")) return null;
  const v = doc.toUpperCase().replace(/[\s-]/g, "");
  const m = type === "NIF" ? /^(\d{8})([A-Z])$/.exec(v) : /^([XYZ])(\d{7})([A-Z])$/.exec(v);
  if (!m) return type === "NIF" ? "Un NIF son 8 cifras y una letra." : "Un NIE es X, Y o Z, 7 cifras y una letra.";
  const number = type === "NIF" ? Number(m[1]) : Number(`${"XYZ".indexOf(m[1])}${m[2]}`);
  const letter = type === "NIF" ? m[2] : m[3];
  return LETTERS[number % 23] === letter ? null : `La letra no corresponde a este ${type}.`;
}
