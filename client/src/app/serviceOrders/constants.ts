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
