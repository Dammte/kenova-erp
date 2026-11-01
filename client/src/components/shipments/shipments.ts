/** Design R2 3.14: shipments of devices between a partner store and Medina. */

export type ShipmentStatus = "sent" | "received" | "received_incomplete";

export const SHIPMENT_STATUSES: ShipmentStatus[] = [
  "sent",
  "received",
  "received_incomplete",
];

export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  sent: "Enviado",
  received: "Recibido",
  received_incomplete: "Recibido incompleto",
};

/** GET /api/shipments/:id, one device of the shipment. */
export interface ShipmentLine {
  orderId: string;
  orderCode: string;
  clientName: string;
  device: string | null;
  accessories: string | null;
  receivedAt: string | null;
  notArrived: boolean;
}

/** GET /api/shipments (lines only in the detail). */
export interface Shipment {
  id: string;
  code: string;
  status: ShipmentStatus;
  fromStore: { id: string; name: string };
  toStore: { id: string; name: string };
  carrier: string | null;
  createdBy: { id: string; fullName: string } | null;
  createdAt: string;
  receivedAt: string | null;
  deviceCount: number;
  lines?: ShipmentLine[];
}

export interface ShipmentPage {
  items: Shipment[];
  total: number;
}

/** GET /api/shipments/candidates: a device that can go in a new shipment. */
export interface ShipmentCandidate {
  orderId: string;
  orderCode: string;
  status: string;
  clientName: string;
  device: string | null;
  accessories: string | null;
}

/** POST /api/shipments/:id/scan. */
export interface ScanResult {
  result: "received" | "already" | "late" | "foreign" | "unknown";
  message: string;
  orderCode?: string;
  received: number;
  total: number;
}

export const SHIPMENTS_PAGE_SIZE = 30;

const day = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Madrid",
});
const dayShort = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Europe/Madrid",
});

export const formatDay = (iso: string): string => day.format(new Date(iso));

/** «Salió el 30/10/2026 · 4 equipos», as on the list. */
export function shipmentSummary(s: Shipment): string {
  const devices = `${s.deviceCount} ${s.deviceCount === 1 ? "equipo" : "equipos"}`;
  if (s.status === "sent")
    return `Salió el ${formatDay(s.createdAt)} · ${devices}`;
  const when = s.receivedAt ? ` el ${formatDay(s.receivedAt)}` : "";
  return `${SHIPMENT_STATUS_LABEL[s.status]}${when} · ${devices}`;
}

/** Where one device of the shipment is, in the «Recepción» column. */
export function lineState(line: ShipmentLine): {
  label: string;
  tone: "ok" | "warn" | "muted";
} {
  if (line.receivedAt)
    return {
      label: `Recibido ${dayShort.format(new Date(line.receivedAt))}`,
      tone: "ok",
    };
  if (line.notArrived) return { label: "No llegó", tone: "warn" };
  return { label: "En camino", tone: "muted" };
}

/** Whether this user receives the shipment: the destination store, or any partner. */
export function canReceive(
  s: Pick<Shipment, "status" | "toStore">,
  user: { role: string; storeId: string | null },
): boolean {
  if (s.status !== "sent") return false;
  return user.role === "SUPER_ADMIN" || user.storeId === s.toStore.id;
}

/** The address of the list: status filter, page and the open shipment. */
export interface ShipmentQuery {
  status: ShipmentStatus | null;
  page: number;
}

export function readQuery(params: URLSearchParams): ShipmentQuery {
  const s = params.get("estado");
  const page = Number(params.get("page"));
  return {
    status: SHIPMENT_STATUSES.includes(s as ShipmentStatus)
      ? (s as ShipmentStatus)
      : null,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** The API call for a list query. */
export function listUrl(q: ShipmentQuery): string {
  const p = new URLSearchParams();
  if (q.page > 1) p.set("page", String(q.page));
  if (q.status) p.set("status", q.status);
  const s = p.toString();
  return `/api/shipments${s ? `?${s}` : ""}`;
}
