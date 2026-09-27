export enum ServiceStatus {
  EN_PROGRESO = "en_progreso",
  PENDIENTE_CLIENTE = "pendiente_cliente",
  PENDIENTE_PIEZAS = "pendiente_piezas",
  FINALIZADO = "finalizado",
  ENTREGADO = "entregado",
  CANCELADO = "cancelado",
}

export enum Priority {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  URGENT = "urgent",
}

export enum PaymentStatus {
  PAID = "paid",
  PAID_PARTIAL = "paid_partial",
  PENDING = "pending",
}

export enum PaymentMethod {
  CASH = "cash",
  CARD = "card",
  TRANSFER = "transfer",
  OTHER = "other",
}

export interface Client {
  id: string;
  dniType?: "NIF" | "NIE" | "PASSPORT";
  dni?: string;
  firstName: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  preferredContact?: "EMAIL" | "PHONE" | "SMS";
  isActive?: boolean;
}

export interface Device {
  id: string;
  inventoryCode: string;
  type: string;
  brand: string;
  model: string;
  imei?: string;
  /** 'CODE' | 'PATTERN' when an unlock secret is stored; the value is only available via reveal. */
  unlockSecretType?: "CODE" | "PATTERN" | null;
  observations?: string;
}

export interface ServiceItem {
  id?: string;
  name?: string;
  description?: string;
  price?: number;
}

export interface ServiceOrder {
  id: string;
  client: Client;
  device: Device | null;
  services?: ServiceItem[];
  priority: Priority;
  status: ServiceStatus;
  assignedTo?: string;
  totalPrice?: number;
  amountPaid?: number;
  balance?: number;
  paymentStatus?: string;
  paymentMethod?: string;
  observations?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  salesPrice: number;
  stock: number;
}

export interface SelectedPart {
  id: string;
  name: string;
  salesPrice: number;
  stock: number;
  maxStock: number;
}

export interface FinalizationData {
  usedParts: SelectedPart[];
  totalPartsCost: number;
  /** Texto libre que el técnico escribe al finalizar — qué se le hizo al equipo */
  workNotes?: string;
}

export interface ServiceHistoryEntry {
  id: string;
  action: string;
  description: string;
  partsReplaced?: string;
  partsCost?: number;
  laborCost?: number;
  performedAt: string;
  performedBy?: { id: string; name?: string; email?: string };
}

export type SortDirection = "asc" | "desc";

export interface SortConfig {
  field: string;
  direction: SortDirection;
}

export interface EditingCell {
  orderId: string;
  field: string;
}

export type VisibleColumns = Record<string, boolean>;
export type StatusFilters = Record<string, boolean>;
export type PriorityFilters = Record<string, boolean>;
