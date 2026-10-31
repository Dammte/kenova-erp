import { ConflictException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import type { AuthUser } from '../auth/auth.types';
import { scopedStoreId } from '../common/store-scope';
import { Quote } from './entities/quote.entity';
import { todayInSpain } from './quote-dates';

/**
 * Locks the quote an intake comes from and checks it can still be accepted:
 * visible to the actor, not answered yet and not expired.
 */
export async function lockQuoteToAccept(
  m: EntityManager,
  quoteId: string,
  actor: AuthUser,
): Promise<Quote> {
  const storeId = scopedStoreId(actor);
  const quote = await m.getRepository(Quote).findOne({
    where: { id: quoteId, ...(storeId ? { storeId } : {}) },
    lock: { mode: 'pessimistic_write' },
  });
  if (!quote) throw new NotFoundException('Presupuesto no encontrado');
  if (quote.status !== 'draft' && quote.status !== 'sent') {
    throw new ConflictException(
      quote.status === 'accepted'
        ? 'Este presupuesto ya se convirtió en orden'
        : 'El cliente rechazó este presupuesto',
    );
  }
  if (quote.validUntil < todayInSpain()) {
    throw new ConflictException(
      'El presupuesto ha caducado: renuévalo antes de aceptarlo',
    );
  }
  return quote;
}

/** Marks the quote accepted and links it to the order it became. */
export async function markQuoteAccepted(
  m: EntityManager,
  quoteId: string,
  orderId: string,
): Promise<void> {
  await m.getRepository(Quote).update(quoteId, {
    status: 'accepted',
    decidedAt: new Date(),
    orderId,
  });
}
