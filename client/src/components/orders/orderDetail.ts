import type { OrderStatus } from "@/components/ui";
import type { OrderRow } from "./orderList";

/** GET /api/service-orders/:id, the fields the order panel reads. */
export interface OrderDetail {
  id: string;
  code: string;
  status: OrderStatus;
  priority: OrderRow["priority"];
  createdAt: string;
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
}

/** GET /api/service-orders/:id/sticky-notes. */
export interface OrderNote {
  id: number;
  content: string;
  type: "normal" | "important" | "urgent";
  createdAt: string;
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
