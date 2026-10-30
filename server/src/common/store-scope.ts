import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import type { AuthUser } from '../auth/auth.types';
import { ServiceOrder } from '../service-order/entities/service-order.entity';
import { UserRole } from '../users/entities/user.entity';

/**
 * The store whose data the actor is limited to: a store account's own store,
 * or null for the workshop admins, who see every store.
 */
export function scopedStoreId(actor: AuthUser): string | null {
  if (actor.role === UserRole.SUPER_ADMIN) return null;
  if (!actor.storeId) {
    throw new ForbiddenException('Tu cuenta no tiene una tienda asignada');
  }
  return actor.storeId;
}

/** `where` fragment that limits order queries to what the actor may see. */
export function orderScope(actor: AuthUser): { storeId?: string } {
  const storeId = scopedStoreId(actor);
  return storeId ? { storeId } : {};
}

/**
 * Throws 404 unless the order exists, is not deleted and the actor may see it.
 * Another store's order answers 404, not 403, so its existence is not revealed.
 */
export async function assertOrderVisible(
  m: EntityManager,
  orderId: string,
  actor: AuthUser,
): Promise<void> {
  const found = await m.getRepository(ServiceOrder).exists({
    where: { id: orderId, deletedAt: IsNull(), ...orderScope(actor) },
  });
  if (!found) throw new NotFoundException('Orden de servicio no encontrada');
}
