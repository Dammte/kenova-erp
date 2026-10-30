import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import type { AuthUser } from '../auth/auth.types';
import { Client } from '../clients/entities/client.entity';
import { Device } from '../devices/entities/device.entity';
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

/**
 * SQL condition limiting `alias` (a client) to the ones a store sees: those it
 * registered and those with an order in the store. Binds :scopeStoreId.
 */
export function clientVisibleSql(alias: string): string {
  return `(${alias}."storeId" = :scopeStoreId OR EXISTS (
    SELECT 1 FROM service_orders so
     WHERE so."clientId" = ${alias}.id
       AND so."storeId" = :scopeStoreId
       AND so."deletedAt" IS NULL))`;
}

/** Whether the actor may see the client (any existing client for the workshop admins). */
export async function isClientVisible(
  m: EntityManager,
  clientId: string,
  actor: AuthUser,
): Promise<boolean> {
  const storeId = scopedStoreId(actor);
  const qb = m
    .getRepository(Client)
    .createQueryBuilder('c')
    .where('c.id = :clientId', { clientId });
  if (storeId) qb.andWhere(clientVisibleSql('c'), { scopeStoreId: storeId });
  return qb.getExists();
}

/** Throws 404 unless the actor may see the client. */
export async function assertClientVisible(
  m: EntityManager,
  clientId: string,
  actor: AuthUser,
): Promise<void> {
  if (!(await isClientVisible(m, clientId, actor))) {
    throw new NotFoundException('Cliente no encontrado');
  }
}

/** Throws 404 unless the device exists and its client is visible to the actor. */
export async function assertDeviceVisible(
  m: EntityManager,
  deviceId: string,
  actor: AuthUser,
): Promise<void> {
  const device = await m
    .getRepository(Device)
    .findOne({ where: { id: deviceId }, select: { id: true, clientId: true } });
  const visible =
    device &&
    (scopedStoreId(actor) === null ||
      (device.clientId && (await isClientVisible(m, device.clientId, actor))));
  if (!visible) throw new NotFoundException('Dispositivo no encontrado');
}
