/**
 * Canonical label maps for service order fields.
 * Single source of truth — import from here instead of inline ternary chains.
 */

export const STATUS_LABELS: Record<string, string> = {
  pendiente_cliente: "Pendiente Cliente",
  en_progreso: "En Progreso",
  pendiente_piezas: "Pendiente de Piezas",
  finalizado: "Finalizado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  paid: "Pagado",
  paid_partial: "Pago Parcial",
  pending: "Pendiente",
  overdue: "Vencido",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  other: "Otro",
};

export const DEVICE_TYPE_LABELS: Record<string, string> = {
  movil: "Móvil",
  mobile: "Móvil",
  tablet: "Tablet",
  computador: "Ordenador",
  computer: "Ordenador",
  otro: "Otro",
  other: "Otro",
};

export const CONTACT_METHOD_LABELS: Record<string, string> = {
  PHONE: "Teléfono",
  EMAIL: "Email",
  SMS: "SMS",
};

/** Condition reported at intake (device.status), as offered in DeviceDetailForm. */
export const DEVICE_CONDITION_LABELS: Record<string, string> = {
  working: "Funciona correctamente",
  partial: "Funciona parcialmente",
  not_turning_on: "No enciende",
  broken_screen: "Pantalla rota/dañada",
  liquid_damage: "Daño por líquido",
  battery: "Problemas de batería",
  connectivity: "Problemas de conectividad",
  slow_performance: "Rendimiento lento",
  other: "Otro",
};
