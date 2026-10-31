import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../auth/auth.types';
import { scopedStoreId } from '../common/store-scope';
import { Store } from '../stores/entities/store.entity';

const TZ = 'Europe/Madrid';
export const CASH_METHODS = ['cash', 'card', 'transfer', 'other'] as const;
export type CashMethod = (typeof CASH_METHODS)[number];

/**
 * The cash day a timestamp belongs to in store `s`: its local (Spain) date,
 * or the next one when it falls at or after the store's closing time.
 * Before opening it stays on the same date, the day about to open.
 */
const cashDay = (ts: string) =>
  `(CASE WHEN (${ts} AT TIME ZONE '${TZ}')::time >= s."cashClosesAt"
         THEN (${ts} AT TIME ZONE '${TZ}')::date + 1
         ELSE (${ts} AT TIME ZONE '${TZ}')::date END)`;
const offHours = (ts: string) =>
  `((${ts} AT TIME ZONE '${TZ}')::time < s."cashOpensAt"
    OR (${ts} AT TIME ZONE '${TZ}')::time >= s."cashClosesAt")`;

/**
 * Payments that are real money in the till. Excluded: saldo a favor (no
 * money moves) and the "migrated" charges, which only carry the amount an
 * order had paid before payments existed, dated when it was migrated.
 */
const TILL = `p.method <> 'credit' AND p.origin <> 'migrated'`;
const signed = `CASE WHEN p.kind = 'refund' THEN -p.amount ELSE p.amount END`;

export interface CashMovement {
  id: string;
  kind: 'charge' | 'refund';
  at: string;
  offHours: boolean;
  method: CashMethod;
  /** Signed: refunds are negative. */
  amount: string;
  note: string | null;
  orderId: string;
  orderCode: string;
  clientName: string;
  userName: string | null;
}

export interface CashDay {
  store: { id: string; name: string; opensAt: string; closesAt: string };
  date: string;
  /** open: the current cash day; closed: an earlier one. */
  status: 'open' | 'closed';
  byMethod: Record<CashMethod, { amount: string; count: number }>;
  /** Net of refunds, every method. */
  total: string;
  cash: {
    /** Expected cash when the day opened: the store's float plus every earlier cash day. */
    float: string;
    charges: string;
    refunds: string;
    expected: string;
  };
  movements: CashMovement[];
}

/**
 * Design 3.2 «Movimientos de dinero»: a record of the money that came in and
 * went out of a store's till, per cash day. Nobody opens or closes the day:
 * the store's cash hours do. Read-only for now; manual entries and exits,
 * the optional count and corrections come in later changes.
 */
@Injectable()
export class CashService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** The store to look at: a store account's own; a partner's choice or the main store. */
  private async storeFor(actor: AuthUser, storeId?: string): Promise<Store> {
    const own = scopedStoreId(actor);
    if (own && storeId && storeId !== own) {
      throw new NotFoundException('Tienda no encontrada');
    }
    const repo = this.db.getRepository(Store);
    const id = own ?? storeId;
    const store = id
      ? await repo.findOne({ where: { id } })
      : await repo.findOne({ where: { isMain: true } });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    return store;
  }

  async day(
    actor: AuthUser,
    storeId?: string,
    date?: string,
  ): Promise<CashDay> {
    const store = await this.storeFor(actor, storeId);
    const [{ current }] = await this.db.query<{ current: string }[]>(
      `SELECT ${cashDay('now()')}::text AS current FROM stores s WHERE s.id = $1`,
      [store.id],
    );
    const day = date ?? current;
    if (
      Number.isNaN(Date.parse(day)) ||
      new Date(day).toISOString().slice(0, 10) !== day
    ) {
      throw new BadRequestException('Fecha no válida');
    }
    if (day > current) {
      throw new BadRequestException('Ese día de caja todavía no ha empezado');
    }

    const movements = await this.db.query<CashMovement[]>(
      `SELECT p.id, p.kind, p."createdAt" AS at, ${offHours('p."createdAt"')} AS "offHours",
              p.method, (${signed})::numeric(12,2)::text AS amount, p.note,
              o.id AS "orderId", o.code AS "orderCode",
              trim(c."firstName" || ' ' || coalesce(c."lastName", '')) AS "clientName",
              u."fullName" AS "userName"
         FROM order_payments p
         JOIN stores s ON s.id = p."storeId"
         JOIN service_orders o ON o.id = p."orderId"
         JOIN client c ON c.id = o."clientId"
         LEFT JOIN users u ON u.id = p."createdById"
        WHERE p."storeId" = $1 AND ${TILL} AND ${cashDay('p."createdAt"')} = $2::date
        ORDER BY p."createdAt", p.id`,
      [store.id, day],
    );
    const [before] = await this.db.query<{ cash: string }[]>(
      `SELECT coalesce(sum(${signed}), 0)::numeric(12,2)::text AS cash
         FROM order_payments p JOIN stores s ON s.id = p."storeId"
        WHERE p."storeId" = $1 AND ${TILL} AND p.method = 'cash'
          AND ${cashDay('p."createdAt"')} < $2::date`,
      [store.id, day],
    );

    const cents = (v: string | number) => Math.round(Number(v) * 100);
    const eur = (c: number) => (c / 100).toFixed(2);
    const byMethod = Object.fromEntries(
      CASH_METHODS.map((m) => [m, { amount: 0, count: 0 }]),
    ) as Record<CashMethod, { amount: number; count: number }>;
    let charges = 0;
    let refunds = 0;
    for (const m of movements) {
      const amount = cents(m.amount);
      byMethod[m.method].amount += amount;
      byMethod[m.method].count += 1;
      if (m.method === 'cash') {
        if (amount < 0) refunds += amount;
        else charges += amount;
      }
    }
    const float = cents(store.cashFloat) + cents(before.cash);
    return {
      store: {
        id: store.id,
        name: store.name,
        opensAt: store.cashOpensAt.slice(0, 5),
        closesAt: store.cashClosesAt.slice(0, 5),
      },
      date: day,
      status: day === current ? 'open' : 'closed',
      byMethod: Object.fromEntries(
        CASH_METHODS.map((m) => [
          m,
          { amount: eur(byMethod[m].amount), count: byMethod[m].count },
        ]),
      ) as CashDay['byMethod'],
      total: eur(CASH_METHODS.reduce((sum, m) => sum + byMethod[m].amount, 0)),
      cash: {
        float: eur(float),
        charges: eur(charges),
        refunds: eur(refunds),
        expected: eur(float + charges + refunds),
      },
      movements,
    };
  }
}
