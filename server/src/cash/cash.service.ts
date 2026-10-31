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
import { CreateCashMovementDto } from './dto/create-cash-movement.dto';
import { SaveCashCountDto } from './dto/save-cash-count.dto';
import { CashCount } from './entities/cash-count.entity';
import { CashMovement as CashMovementEntity } from './entities/cash-movement.entity';

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
const manualSigned = `CASE WHEN m.kind = 'out' THEN -m.amount ELSE m.amount END`;

/** One line of a cash day: a payment of an order, or cash put in or taken out by hand. */
export interface CashLine {
  id: string;
  kind: 'charge' | 'refund' | 'in' | 'out';
  at: string;
  offHours: boolean;
  method: CashMethod;
  /** Signed: refunds and exits are negative. */
  amount: string;
  /** A payment's note, or the reason for an entry or exit. */
  note: string | null;
  /** Null for an entry or exit. */
  orderId: string | null;
  orderCode: string | null;
  clientName: string | null;
  userName: string | null;
}

export interface CashDay {
  store: { id: string; name: string; opensAt: string; closesAt: string };
  date: string;
  /** open: the current cash day; closed: an earlier one. */
  status: 'open' | 'closed';
  byMethod: Record<CashMethod, { amount: string; count: number }>;
  /** Payments only, net of refunds, every method; entries and exits are not takings. */
  total: string;
  cash: {
    /**
     * Cash when the day opened: the last counted cash before it (or the
     * store's float if never counted) plus every cash day since.
     */
    float: string;
    charges: string;
    refunds: string;
    /** Entries minus exits. */
    manual: string;
    expected: string;
  };
  /** The optional count; null when nobody counted. */
  count: {
    cash: string | null;
    terminal: string | null;
    note: string | null;
    countedBy: string | null;
    countedAt: string;
  } | null;
  movements: CashLine[];
}

/**
 * Design 3.2 «Movimientos de dinero»: a record of the money that came in and
 * went out of a store's till, per cash day. Nobody opens or closes the day:
 * the store's cash hours do. Correcting a closed day comes in a later change.
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

    const movements = await this.db.query<CashLine[]>(
      `SELECT * FROM (
         SELECT p.id, p.kind, p."createdAt" AS at, ${offHours('p."createdAt"')} AS "offHours",
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
         UNION ALL
         SELECT m.id, m.kind, m."createdAt", ${offHours('m."createdAt"')},
                'cash', (${manualSigned})::numeric(12,2)::text, m.reason,
                NULL, NULL, NULL, u."fullName"
           FROM cash_movements m
           JOIN stores s ON s.id = m."storeId"
           LEFT JOIN users u ON u.id = m."createdById"
          WHERE m."storeId" = $1 AND ${cashDay('m."createdAt"')} = $2::date
       ) t ORDER BY t.at, t.id`,
      [store.id, day],
    );
    // The day starts from the last count of cash before it, or the store's
    // float, plus the cash of every day in between.
    const [last] = await this.db.query<{ date: string; cash: string }[]>(
      `SELECT k.date::text AS date, k.cash::text AS cash FROM cash_counts k
        WHERE k."storeId" = $1 AND k.cash IS NOT NULL AND k.date < $2::date
        ORDER BY k.date DESC LIMIT 1`,
      [store.id, day],
    );
    const since = last?.date ?? null;
    const [before] = await this.db.query<{ cash: string }[]>(
      `SELECT (
         (SELECT coalesce(sum(${signed}), 0)
            FROM order_payments p JOIN stores s ON s.id = p."storeId"
           WHERE p."storeId" = $1 AND ${TILL} AND p.method = 'cash'
             AND ${cashDay('p."createdAt"')} < $2::date
             AND ($3::date IS NULL OR ${cashDay('p."createdAt"')} > $3::date))
         + (SELECT coalesce(sum(${manualSigned}), 0)
              FROM cash_movements m JOIN stores s ON s.id = m."storeId"
             WHERE m."storeId" = $1 AND ${cashDay('m."createdAt"')} < $2::date
               AND ($3::date IS NULL OR ${cashDay('m."createdAt"')} > $3::date))
       )::numeric(12,2)::text AS cash`,
      [store.id, day, since],
    );
    const [count] = await this.db.query<NonNullable<CashDay['count']>[]>(
      `SELECT k.cash::text AS cash, k.terminal::text AS terminal, k.note,
              u."fullName" AS "countedBy", k."countedAt"
         FROM cash_counts k LEFT JOIN users u ON u.id = k."countedById"
        WHERE k."storeId" = $1 AND k.date = $2::date`,
      [store.id, day],
    );

    const cents = (v: string | number) => Math.round(Number(v) * 100);
    const eur = (c: number) => (c / 100).toFixed(2);
    const byMethod = Object.fromEntries(
      CASH_METHODS.map((m) => [m, { amount: 0, count: 0 }]),
    ) as Record<CashMethod, { amount: number; count: number }>;
    let charges = 0;
    let refunds = 0;
    let manual = 0;
    for (const m of movements) {
      const amount = cents(m.amount);
      if (m.kind === 'in' || m.kind === 'out') {
        manual += amount;
        continue;
      }
      byMethod[m.method].amount += amount;
      byMethod[m.method].count += 1;
      if (m.method === 'cash') {
        if (amount < 0) refunds += amount;
        else charges += amount;
      }
    }
    const float = cents(last?.cash ?? store.cashFloat) + cents(before.cash);
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
        manual: eur(manual),
        expected: eur(float + charges + refunds + manual),
      },
      count: count ?? null,
      movements,
    };
  }

  /**
   * Cash put in or taken out by hand. It goes to the cash day running now
   * (after closing, the next one), like a payment taken at the same time.
   */
  async addMovement(
    actor: AuthUser,
    dto: CreateCashMovementDto,
  ): Promise<{ id: string; date: string }> {
    const store = await this.storeFor(actor, dto.storeId);
    const saved = await this.db.getRepository(CashMovementEntity).save({
      storeId: store.id,
      kind: dto.kind,
      amount: dto.amount.toFixed(2),
      reason: dto.reason,
      createdById: actor.id,
    });
    const [{ date }] = await this.db.query<{ date: string }[]>(
      `SELECT ${cashDay('$2::timestamptz')}::text AS date FROM stores s WHERE s.id = $1`,
      [store.id, saved.createdAt],
    );
    return { id: saved.id, date };
  }

  /**
   * Saves the optional count of the cash day running now. It can be saved
   * again until the day closes; a closed day's count is not changed here.
   */
  async saveCount(actor: AuthUser, dto: SaveCashCountDto): Promise<CashDay> {
    const store = await this.storeFor(actor, dto.storeId);
    const cash = dto.cash ?? null;
    const terminal = dto.terminal ?? null;
    if (cash === null && terminal === null) {
      throw new BadRequestException(
        'Escribe el efectivo contado o el total del datáfono',
      );
    }
    const [{ current }] = await this.db.query<{ current: string }[]>(
      `SELECT ${cashDay('now()')}::text AS current FROM stores s WHERE s.id = $1`,
      [store.id],
    );
    await this.db.getRepository(CashCount).upsert(
      {
        storeId: store.id,
        date: current,
        cash: cash === null ? null : cash.toFixed(2),
        terminal: terminal === null ? null : terminal.toFixed(2),
        note: dto.note ?? null,
        countedById: actor.id,
      },
      ['storeId', 'date'],
    );
    return this.day(actor, store.id, current);
  }
}
