import { UserRole } from '../users/entities/user.entity';
import { ServiceStatus } from './entities/service-order.entity';

const CLOSED: ServiceStatus[] = [
  ServiceStatus.ENTREGADO,
  ServiceStatus.CANCELADO,
];

/**
 * Why an order cannot move from `from` to `to` through the API, or null when
 * it can (design R3 B3). The screens only offer the allowed moves; this keeps
 * a stale screen or a hand-made request from skipping steps.
 */
export function transitionProblem(
  from: ServiceStatus,
  to: ServiceStatus,
  role: UserRole,
): string | null {
  if (from === to) return null;
  // Delivering straight from the workshop stays possible (it sets both
  // dates): the screens offer «Entregar» only once finished.
  // Delivered and cancelled orders are closed: only the partners reopen one.
  if (CLOSED.includes(from) && role !== UserRole.SUPER_ADMIN) {
    return from === ServiceStatus.ENTREGADO
      ? 'La orden ya está entregada: solo un socio puede reabrirla'
      : 'La orden está cancelada: solo un socio puede reabrirla';
  }
  return null;
}

/**
 * Why a move cannot be done in a batch (design R3 B4: only the moves the
 * list makes on the spot), or null. A finished order only goes back to work;
 * a delivered or cancelled one is reopened from its own page, with a reason.
 */
export function bulkProblem(
  from: ServiceStatus,
  to: ServiceStatus,
): string | null {
  if (CLOSED.includes(from))
    return from === ServiceStatus.ENTREGADO
      ? 'Está entregada: se reabre desde su ficha'
      : 'Está cancelada: se reabre desde su ficha';
  if (from === ServiceStatus.FINALIZADO && to !== ServiceStatus.EN_PROGRESO)
    return 'Está finalizada: solo puede volver a «En progreso»';
  return null;
}
