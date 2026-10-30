import {
  CircleCheck,
  CircleX,
  Clock,
  PackageCheck,
  PackageSearch,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import styles from "./StatusChip.module.css";

/** The six order statuses of the server. */
export type OrderStatus =
  | "en_progreso"
  | "pendiente_cliente"
  | "pendiente_piezas"
  | "finalizado"
  | "entregado"
  | "cancelado";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  en_progreso: "En progreso",
  pendiente_cliente: "Pendiente cliente",
  pendiente_piezas: "Pendiente de piezas",
  finalizado: "Finalizado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

const STATUS_ICON: Record<OrderStatus, LucideIcon> = {
  en_progreso: Wrench,
  pendiente_cliente: Clock,
  pendiente_piezas: PackageSearch,
  finalizado: CircleCheck,
  entregado: PackageCheck,
  cancelado: CircleX,
};

/**
 * Design system 3.6: a filled pill with icon and text. The colour is never the
 * only cue, so the label is always shown.
 */
export function StatusChip({ status }: { status: OrderStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={`${styles.chip} ${styles[status]}`}>
      <Icon size={14} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}
