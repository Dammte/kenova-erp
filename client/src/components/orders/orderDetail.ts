import type { OrderStatus } from "@/components/ui";
import type { OrderRow } from "./orderList";

/** Where a device received at a partner store is, apart from its status (server OrderLocation). */
export type OrderLocation = "at_store" | "to_workshop" | "at_workshop" | "to_store" | "ready_at_store";

export const LOCATION_LABEL: Record<OrderLocation, string> = {
  at_store: "En tienda (recepción)",
  to_workshop: "Enviado al taller",
  at_workshop: "En el taller",
  to_store: "Enviado a tienda",
  ready_at_store: "En tienda (listo para entregar)",
};

/**
 * Why a partner store's order cannot be handed back yet: its device is not
 * back at the store. Null when it is, or for workshop orders.
 */
export function awayReason(order: Pick<OrderDetail, "location">): string | null {
  const where = order.location;
  if (!where || where === "ready_at_store" || where === "at_store") return null;
  return `El equipo aún no ha vuelto a la tienda (${LOCATION_LABEL[where]})`;
}

/** GET /api/service-orders/:id, the fields the order panel reads. */
export interface OrderDetail {
  id: string;
  code: string;
  status: OrderStatus;
  priority: OrderRow["priority"];
  createdAt: string;
  /** Design R3 B5: sent back with an edit, so a change made meanwhile is not overwritten. */
  updatedAt?: string;
  finishedAt: string | null;
  deliveredAt: string | null;
  reportedFaults: string[];
  faultNotes: string | null;
  physicalCondition: string | null;
  accessories: string | null;
  observations: string | null;
  totalPrice: string | number | null;
  amountPaid: string | number | null;
  balance: string | number | null;
  paymentStatus: OrderRow["paymentStatus"];
  cancelReason: string | null;
  workDone: string | null;
  warrantyOfId: string | null;
  /** The delivered order this one is a warranty claim of. */
  warrantyOf?: { id: string; code: string } | null;
  /** A warranty claim that turned out not to be covered, and why. */
  warrantyRejectedReason?: string | null;
  storeId?: string;
  /** Where a partner store's device is; null for orders taken in at the workshop. */
  location?: OrderLocation | null;
  /** Its quote: the one it came from, or the one made for it in the workshop. */
  quote?: { id: string; code: string; status: string } | null;
  /** The customer waived a written quote; prints skip "presupuesto válido". */
  waivesQuote?: boolean;
  client: {
    id: string;
    firstName: string;
    lastName: string | null;
    dniType: "NIF" | "NIE" | "PASSPORT" | "CIF";
    dni: string | null;
    email: string | null;
    phoneNumber: string | null;
    preferredContact: "EMAIL" | "PHONE" | "SMS";
  };
  device: {
    id: string;
    type: string;
    brand: string;
    model: string;
    imei: string | null;
    unlockSecretType: "CODE" | "PATTERN" | null;
  } | null;
  lines: {
    id: string;
    kind: "service" | "adjustment";
    /** The catalog service it comes from; a line written by hand has none. */
    serviceId?: string | null;
    description: string;
    unitPrice: string;
    quantity: number;
  }[];
  serviceHistory: {
    id: string;
    action: string;
    description: string;
    performedAt: string;
  }[];
}

/** GET /api/service-orders/:id/payments. */
export interface OrderPayment {
  id: string;
  kind: "charge" | "refund";
  amount: string;
  method: "cash" | "card" | "transfer" | "other" | "credit";
  note: string | null;
  createdAt: string;
  createdBy: { id: string; fullName: string } | null;
  /** A refund: the charge it gave back, when it says which. */
  refundOfId?: string | null;
  /** A charge: what has been given back of it. */
  refunded?: string;
  /** A charge: its store's cash day is over (store accounts cannot refund it). */
  dayClosed?: boolean;
}

/** GET /api/service-orders/:id/sticky-notes. */
export interface OrderNote {
  id: number;
  content: string;
  type: "normal" | "important" | "urgent";
  createdAt: string;
  /** Null for notes from before authors were kept. */
  createdBy: { id: string; fullName: string } | null;
}

export const DEVICE_TYPE_LABEL: Record<string, string> = {
  movil: "Móvil",
  smartphone: "Móvil",
  tablet: "Tablet",
  computador: "Ordenador",
  otro: "Otro",
};

export const METHOD_LABEL: Record<OrderPayment["method"], string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  other: "Otro",
  credit: "Saldo a favor",
};

export const CONTACT_LABEL: Record<OrderDetail["client"]["preferredContact"], string> = {
  PHONE: "prefiere teléfono",
  EMAIL: "prefiere email",
  SMS: "prefiere SMS",
};

const OPEN: OrderStatus[] = ["en_progreso", "pendiente_cliente", "pendiente_piezas"];

/** Design 2.4: a quote can be made for a device still in the workshop, once. */
export const canQuote = (order: Pick<OrderDetail, "status" | "quote">) => OPEN.includes(order.status) && !order.quote;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Days in the shop, or days waiting to be collected once finished; null once
 * the order is closed. Same rule as the list.
 */
export function shopDays(order: OrderDetail, now = Date.now()): number | null {
  if (order.status === "finalizado") {
    return Math.floor((now - Date.parse(order.finishedAt ?? order.createdAt)) / DAY_MS);
  }
  if (OPEN.includes(order.status)) return Math.floor((now - Date.parse(order.createdAt)) / DAY_MS);
  return null;
}

const dateTime = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "29/10/2026 09:57". */
export const formatDateTime = (iso: string): string => dateTime.format(new Date(iso)).replace(",", "");

/** wa.me wants the number with country code and digits only; Spain by default. */
export function whatsappHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits.length === 9 ? `34${digits}` : digits}`;
}
