import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../auth/auth.types';
import { scopedStoreId } from '../common/store-scope';
import { Store } from '../stores/entities/store.entity';
import { UserRole } from '../users/entities/user.entity';

/** Days in "Pendiente de piezas" after which a part counts as late. */
export const LATE_PART_DAYS = 7;
/** Days finished and not collected after which the device needs a call. */
export const UNCOLLECTED_DAYS = 30;
/** Rows shown in each list; the total says how many there are. */
const LIST_LIMIT = 5;
const TZ = 'Europe/Madrid';

/** Local (Spain) calendar day of a timestamp column, for "today" and the week. */
const day = (col: string) => `(${col} AT TIME ZONE '${TZ}')::date`;
const TODAY = `(now() AT TIME ZONE '${TZ}')::date`;

interface List<T> {
  total: number;
  rows: T[];
}

export interface TodaySummary {
  date: string;
  counts: {
    received: number;
    receivedLastWeek: number;
    inProgress: number;
    inProgressUrgent: number;
    waitingParts: number;
    waitingPartsLate: number;
    ready: number;
    readyNotNotified: number;
    collectedToday: string;
    pendingBalance: string;
  };
  toNotify: List<{
    id: string;
    code: string;
    clientName: string;
    model: string | null;
    days: number;
  }>;
  lateParts: List<{
    id: string;
    code: string;
    clientName: string;
    model: string | null;
    days: number;
  }>;
  uncollected: List<{
    id: string;
    code: string;
    clientName: string;
    phone: string | null;
    model: string | null;
    days: number;
    balance: string;
    notices: number;
  }>;
  /** Partners only: stock is theirs (decision 5); null for a store. */
  lowStock: List<{
    id: string;
    sku: string;
    name: string;
    stock: number;
    minimalStock: number;
  }> | null;
  week: { day: string; received: number; delivered: number }[];
  openByStatus: Record<
    'en_progreso' | 'pendiente_cliente' | 'pendiente_piezas' | 'finalizado',
    number
  >;
}

/**
 * Design 3.1 «Hoy»: what needs doing today, in one read. Counts and short
 * lists for one store, or every store for the partners. No VAT or invoicing
 * figures: only operations and internal takings.
 */
@Injectable()
export class TodayService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** The store to look at: a store account's own; a partner's choice or all. */
  private async storeFor(
    actor: AuthUser,
    storeId?: string,
  ): Promise<string | null> {
    const own = scopedStoreId(actor);
    if (own) {
      if (storeId && storeId !== own) {
        throw new NotFoundException('Tienda no encontrada');
      }
      return own;
    }
    if (!storeId) return null;
    const exists = await this.db
      .getRepository(Store)
      .exists({ where: { id: storeId } });
    if (!exists) throw new NotFoundException('Tienda no encontrada');
    return storeId;
  }

  async summary(actor: AuthUser, storeId?: string): Promise<TodaySummary> {
    const store = await this.storeFor(actor, storeId);
    // $1 is the store or null for all; every query filters orders the same way.
    const orders = `o."deletedAt" IS NULL AND ($1::uuid IS NULL OR o."storeId" = $1)`;
    const p = [store];
    const name = `trim(c."firstName" || ' ' || coalesce(c."lastName", ''))`;
    const from = `FROM service_orders o
      JOIN client c ON c.id = o."clientId"
      LEFT JOIN devices d ON d.id = o."deviceId"`;
    // When the order last went into "Pendiente de piezas" (from its history).
    const partsSince = `coalesce((SELECT max(h."performedAt") FROM service_history h
        WHERE h."serviceOrderId" = o.id AND h.action = 'cambio_estado'
          AND h.description LIKE '%a "Pendiente Piezas"'), o."createdAt")`;
    const readyNotice = `EXISTS (SELECT 1 FROM order_notices n
        WHERE n."serviceOrderId" = o.id AND n.trigger = 'ready'
          AND n."sentAt" >= o."finishedAt")`;

    const [counts] = await this.db.query<Record<string, string>[]>(
      `SELECT
         count(*) FILTER (WHERE ${day('o."createdAt"')} = ${TODAY}) AS received,
         count(*) FILTER (WHERE ${day('o."createdAt"')} = ${TODAY} - 7) AS "receivedLastWeek",
         count(*) FILTER (WHERE o.status = 'en_progreso') AS "inProgress",
         count(*) FILTER (WHERE o.status = 'en_progreso' AND o.priority IN ('high', 'urgent')) AS "inProgressUrgent",
         count(*) FILTER (WHERE o.status = 'pendiente_piezas') AS "waitingParts",
         count(*) FILTER (WHERE o.status = 'pendiente_piezas'
                            AND ${partsSince} <= now() - make_interval(days => ${LATE_PART_DAYS})) AS "waitingPartsLate",
         count(*) FILTER (WHERE o.status = 'finalizado') AS ready,
         count(*) FILTER (WHERE o.status = 'finalizado' AND NOT ${readyNotice}) AS "readyNotNotified",
         count(*) FILTER (WHERE o.status = 'pendiente_cliente') AS "pendingClient",
         coalesce(sum(o.balance) FILTER (WHERE o.status <> 'cancelado' AND o.balance > 0), 0)::numeric(12,2)::text AS "pendingBalance"
       FROM service_orders o WHERE ${orders}`,
      p,
    );
    const [money] = await this.db.query<{ collected: string }[]>(
      `SELECT coalesce(sum(CASE WHEN p.kind = 'refund' THEN -p.amount ELSE p.amount END), 0)::numeric(12,2)::text AS collected
         FROM order_payments p
        WHERE p.method <> 'credit'
          AND ${day('p."createdAt"')} = ${TODAY}
          AND ($1::uuid IS NULL OR p."storeId" = $1)`,
      p,
    );

    const list = async <T>(
      sql: string,
      params: unknown[] = p,
    ): Promise<List<T>> => {
      const rows = await this.db.query<(T & { total: string })[]>(sql, params);
      return {
        total: Number(rows[0]?.total ?? 0),
        rows: rows.map((r) => {
          const row: Partial<typeof r> = { ...r };
          delete row.total;
          return row as T;
        }),
      };
    };

    const toNotify = await list<TodaySummary['toNotify']['rows'][number]>(
      `SELECT o.id, o.code, ${name} AS "clientName", d.model,
              floor(extract(epoch FROM now() - o."finishedAt") / 86400)::int AS days,
              count(*) OVER () AS total
         ${from}
        WHERE ${orders} AND o.status = 'finalizado' AND NOT ${readyNotice}
        ORDER BY o."finishedAt" ASC LIMIT ${LIST_LIMIT}`,
    );
    const lateParts = await list<TodaySummary['lateParts']['rows'][number]>(
      `SELECT t.*, count(*) OVER () AS total FROM (
         SELECT o.id, o.code, ${name} AS "clientName", d.model,
                floor(extract(epoch FROM now() - ${partsSince}) / 86400)::int AS days
           ${from}
          WHERE ${orders} AND o.status = 'pendiente_piezas') t
        WHERE t.days >= ${LATE_PART_DAYS}
        ORDER BY t.days DESC LIMIT ${LIST_LIMIT}`,
    );
    const uncollected = await list<TodaySummary['uncollected']['rows'][number]>(
      `SELECT o.id, o.code, ${name} AS "clientName", c."phoneNumber" AS phone, d.model,
              floor(extract(epoch FROM now() - o."finishedAt") / 86400)::int AS days,
              coalesce(o.balance, 0)::text AS balance,
              (SELECT count(*)::int FROM order_notices n
                WHERE n."serviceOrderId" = o.id AND n."sentAt" >= o."finishedAt") AS notices,
              count(*) OVER () AS total
         ${from}
        WHERE ${orders} AND o.status = 'finalizado'
          AND o."finishedAt" <= now() - make_interval(days => ${UNCOLLECTED_DAYS})
        ORDER BY o."finishedAt" ASC LIMIT ${LIST_LIMIT}`,
    );
    const lowStock =
      actor.role === UserRole.SUPER_ADMIN
        ? await list<NonNullable<TodaySummary['lowStock']>['rows'][number]>(
            `SELECT i.id, i.sku, i.name, coalesce(i.stock, 0) AS stock, i."minimalStock",
                    count(*) OVER () AS total
               FROM inventory i
              WHERE i."deletedAt" IS NULL AND i."minimalStock" IS NOT NULL
                AND coalesce(i.stock, 0) < i."minimalStock"
              ORDER BY coalesce(i.stock, 0) ASC, i.name LIMIT ${LIST_LIMIT}`,
            [],
          )
        : null;
    const week = await this.db.query<TodaySummary['week']>(
      `SELECT to_char(g.d, 'YYYY-MM-DD') AS day,
              (SELECT count(*)::int FROM service_orders o
                WHERE ${orders} AND ${day('o."createdAt"')} = g.d) AS received,
              (SELECT count(*)::int FROM service_orders o
                WHERE ${orders} AND o.status = 'entregado' AND ${day('o."deliveredAt"')} = g.d) AS delivered
         FROM generate_series(${TODAY} - 6, ${TODAY}, interval '1 day') AS g(d)
        ORDER BY g.d`,
      p,
    );
    const [{ date }] = await this.db.query<{ date: string }[]>(
      `SELECT to_char(${TODAY}, 'YYYY-MM-DD') AS date`,
    );

    const n = (k: string) => Number(counts[k] ?? 0);
    return {
      date,
      counts: {
        received: n('received'),
        receivedLastWeek: n('receivedLastWeek'),
        inProgress: n('inProgress'),
        inProgressUrgent: n('inProgressUrgent'),
        waitingParts: n('waitingParts'),
        waitingPartsLate: n('waitingPartsLate'),
        ready: n('ready'),
        readyNotNotified: n('readyNotNotified'),
        collectedToday: money.collected,
        pendingBalance: counts.pendingBalance,
      },
      toNotify,
      lateParts,
      uncollected,
      lowStock,
      week,
      openByStatus: {
        en_progreso: n('inProgress'),
        pendiente_cliente: n('pendingClient'),
        pendiente_piezas: n('waitingParts'),
        finalizado: n('ready'),
      },
    };
  }
}
