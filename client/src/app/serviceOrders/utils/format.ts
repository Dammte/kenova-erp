import styles from "../page.module.css";

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

export const formatCurrency = (amount: number | undefined): string => {
  if (amount === undefined) return "N/A";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
};

export const getStatusClass = (status: string): string => {
  const map: Record<string, string> = {
    pendiente_cliente: styles.statusPendienteCliente,
    en_progreso: styles.statusEnProgreso,
    pendiente_piezas: styles.statusPendientePiezas,
    finalizado: styles.statusFinalizado,
    entregado: styles.statusEntregado,
    cancelado: styles.statusCancelado,
  };
  return map[status] ?? "";
};

export const getPriorityClass = (priority: string): string => {
  const map: Record<string, string> = {
    low: styles.priorityLow,
    medium: styles.priorityMedium,
    high: styles.priorityHigh,
    urgent: styles.priorityUrgent,
  };
  return map[priority] ?? "";
};

export const getPaymentStatusClass = (paymentStatus?: string): string => {
  const map: Record<string, string> = {
    paid: styles.paymentPaid,
    paid_partial: styles.paymentPartial,
    pending: styles.paymentPending,
    overdue: styles.paymentOverdue,
  };
  return map[(paymentStatus ?? "").toLowerCase()] ?? "";
};
