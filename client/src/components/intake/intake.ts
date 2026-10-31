import { FAULT_LABEL } from "@/components/orders/orderList";
import type { Method } from "@/components/orders/ChargeForm";

/** A client as GET /api/clients/search returns it. */
export interface FoundClient {
  id: string;
  firstName: string;
  lastName: string | null;
  phoneNumber: string | null;
  dniType?: string | null;
  dni?: string | null;
}

/** A device as GET /api/devices/client/:id returns it. */
export interface KnownDevice {
  id: string;
  type: string;
  brand: string;
  model: string;
  imei: string | null;
  createdAt: string;
}

export interface NewClient {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
}

export interface NewDevice {
  type: string;
  brand: string;
  model: string;
  imei: string;
  /** How the device is unlocked; only the chosen secret is sent. */
  unlock: Unlock;
  /** PIN or password. */
  code: string;
  /** Pattern dots 1-9 joined with "-", e.g. "1-5-9-6". */
  pattern: string;
}

export type Unlock = "none" | "code" | "pattern";

export const UNLOCKS: [Unlock, string][] = [
  ["none", "Sin código"],
  ["code", "PIN o contraseña"],
  ["pattern", "Patrón"],
];

/** The server's pattern format; Android asks for 4 dots at least. */
export const PATTERN_RE = /^[1-9](-[1-9]){3,8}$/;

export type Priority = "low" | "medium" | "high" | "urgent";

/** A service of the price list (GET /api/services?available=true). */
export interface PricedService {
  id: string;
  name: string;
  /** Decimal as the server sends it, e.g. "149.00". */
  price: string | number;
  category?: string | null;
  estimatedTime?: string | null;
}

export interface IntakeState {
  client: FoundClient | NewClient | null;
  /** A device the client already had, or a new one. */
  device: KnownDevice | NewDevice | null;
  faults: string[];
  faultNotes: string;
  physicalCondition: string;
  accessories: string;
  priority: Priority;
  observations: string;
  services: PricedService[];
  /** The agreed total when it is not the sum of the services. */
  total: number | null;
  /** Paid on account at intake. */
  deposit: number | null;
  method: Method | null;
}

export const EMPTY_CLIENT: NewClient = { firstName: "", lastName: "", phoneNumber: "", email: "" };
export const EMPTY_DEVICE: NewDevice = { type: "movil", brand: "", model: "", imei: "", unlock: "none", code: "", pattern: "" };

export const DEVICE_TYPES = [
  ["movil", "Móvil"],
  ["tablet", "Tablet"],
  ["computador", "Ordenador"],
  ["otro", "Otro"],
] as const;

/** The server's fault list, in its order. */
export const FAULTS = Object.keys(FAULT_LABEL);

export const PRIORITIES: [Priority, string][] = [
  ["low", "Baja"],
  ["medium", "Media"],
  ["high", "Alta"],
  ["urgent", "Urgente"],
];

export const ACCESSORY_CHIPS = ["Funda", "Cargador", "Tarjeta SIM"];
export const CONDITION_CHIPS = ["Arañazos", "Pantalla rota", "Golpes"];

export const isKnown = <T extends { id: string }>(x: T | object | null): x is T =>
  Boolean(x && "id" in x);

const digits = (s: string) => s.replace(/\D/g, "");

/**
 * Design 1.3: what was typed in the client search fills the new client. Digits
 * go to the phone, an @ to the email, anything else to the name.
 */
export function newClientFrom(search: string): NewClient {
  const text = search.trim();
  if (text.includes("@")) return { ...EMPTY_CLIENT, email: text };
  const phone = text.match(/[\d\s]{3,}/)?.[0].trim() ?? "";
  const name = text.replace(phone, "").replace(/\s+/g, " ").trim();
  return { ...EMPTY_CLIENT, phoneNumber: phone, firstName: name ? name[0].toUpperCase() + name.slice(1) : "" };
}

/** IMEIs come from a scanner or a paste: no spaces or dashes. */
export const cleanImei = (s: string) => s.replace(/[\s-]/g, "");

/** Adds a quick chip to a free-text field, or takes it out again. */
export function toggleWord(text: string, word: string): string {
  const parts = text
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const next = parts.includes(word) ? parts.filter((p) => p !== word) : [...parts, word];
  return next.join(", ");
}

const cents = (n: number | string) => Math.round(Number(n) * 100);

/** Sum of the chosen services, in euros. */
export const servicesSum = (services: PricedService[]) =>
  services.reduce((sum, x) => sum + cents(x.price), 0) / 100;

/** The order total: the agreed one, or else the services' sum. */
export const orderTotal = (s: Pick<IntakeState, "services" | "total">) => s.total ?? servicesSum(s.services);

/** What still stops the order from being created, in screen order. */
export function missing(s: IntakeState): { field: string; text: string }[] {
  const out: { field: string; text: string }[] = [];
  if (!s.client) out.push({ field: "client-search", text: "Cliente" });
  else if (!isKnown(s.client)) {
    if (!s.client.firstName.trim()) out.push({ field: "client-name", text: "Cliente: nombre" });
    if (digits(s.client.phoneNumber).length < 9)
      out.push({ field: "client-phone", text: "Cliente: teléfono de 9 cifras" });
  }
  if (!s.device) out.push({ field: "device", text: "Dispositivo" });
  else if (!isKnown(s.device)) {
    if (!s.device.brand.trim()) out.push({ field: "device-brand", text: "Dispositivo: marca" });
    if (!s.device.model.trim()) out.push({ field: "device-model", text: "Dispositivo: modelo" });
    if (s.device.unlock === "code" && !s.device.code.trim())
      out.push({ field: "device-code", text: "Desbloqueo: PIN o contraseña" });
    if (s.device.unlock === "pattern" && !PATTERN_RE.test(s.device.pattern))
      out.push({ field: "device-pattern", text: "Desbloqueo: patrón de 4 puntos o más" });
  }
  if (s.faults.length === 0) out.push({ field: "faults", text: "Avería declarada" });
  if (s.deposit && cents(s.deposit) > cents(orderTotal(s)))
    out.push({ field: "deposit", text: "A cuenta mayor que el total" });
  if (s.deposit && !s.method) out.push({ field: "method", text: "Forma de pago de lo que deja a cuenta" });
  return out;
}

const orNull = (s: string) => s.trim() || null;

/** POST /api/service-orders/intake. New orders start "En progreso" (decision D1). */
export function intakePayload(s: IntakeState) {
  const client = s.client!;
  const device = s.device!;
  return {
    ...(isKnown(client)
      ? { clientId: client.id }
      : {
          client: {
            firstName: client.firstName.trim(),
            lastName: orNull(client.lastName),
            phoneNumber: client.phoneNumber.trim(),
            email: orNull(client.email),
          },
        }),
    ...(isKnown(device)
      ? { deviceId: device.id }
      : {
          device: {
            type: device.type,
            brand: device.brand.trim(),
            model: device.model.trim(),
            imei: orNull(cleanImei(device.imei)),
            ...(device.unlock === "code" && device.code.trim() ? { code: device.code.trim() } : {}),
            ...(device.unlock === "pattern" ? { pattern: device.pattern } : {}),
          },
        }),
    order: {
      status: "en_progreso",
      priority: s.priority,
      reportedFaults: FAULTS.filter((f) => s.faults.includes(f)),
      faultNotes: orNull(s.faultNotes),
      physicalCondition: orNull(s.physicalCondition),
      accessories: orNull(s.accessories),
      ...(s.observations.trim() ? { observations: s.observations.trim() } : {}),
      ...(s.services.length ? { serviceIds: s.services.map((x) => x.id) } : {}),
      ...(s.services.length || s.total !== null ? { totalPrice: orderTotal(s) } : {}),
      ...(s.deposit ? { amountPaid: s.deposit, paymentMethod: s.method } : {}),
    },
  };
}
