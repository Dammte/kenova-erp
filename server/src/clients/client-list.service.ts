import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../auth/auth.types';
import { isClientVisible, scopedStoreId } from '../common/store-scope';
import { dismissed } from './client-merge.service';
import { ListClientsDto } from './dto/list-clients.dto';

export const CLIENT_PAGE_SIZE = 50;

export interface ClientRow {
  id: string;
  firstName: string;
  lastName: string | null;
  phoneNumber: string | null;
  dniType: string;
  dni: string | null;
  orders: number;
  lastVisit: string | null;
  /** What the client still owes, on orders not cancelled. */
  balance: string;
  /** Another client the actor sees has the same phone or document. */
  duplicate: boolean;
}

/** Orders shown in a client's history; the total says how many there are. */
export const CLIENT_HISTORY = 10;

export interface ClientSummary {
  stats: {
    orders: number;
    /** What the client has paid (charges minus refunds), not what was quoted. */
    spent: string;
    balance: string;
    open: number;
    lastVisit: string | null;
  };
  devices: {
    id: string;
    type: string;
    brand: string;
    model: string;
    imei: string | null;
    orders: number;
  }[];
  history: {
    total: number;
    rows: {
      id: string;
      code: string;
      model: string | null;
      faults: string[];
      date: string;
      status: string;
      totalPrice: string;
    }[];
  };
}

/** Last nine digits of a phone column, so "+34 612 345 678" matches "612345678". */
const phoneKey = (col: string) =>
  `nullif(right(regexp_replace(coalesce(${col}, ''), '\\D', '', 'g'), 9), '')`;

/** A document without spaces, dashes or case, so "12345678-z" matches "12345678Z". */
const docKey = (col: string) =>
  `nullif(regexp_replace(upper(coalesce(${col}, '')), '[^A-Z0-9]', '', 'g'), '')`;

/**
 * Design 3.3: the client list of the counter, newest visit first, with what
 * each one has brought and owes, and a warning when two look like the same
 * person (same phone or same document). A store sees and counts only its
 * own clients and orders; duplicates are only looked for among them.
 */
@Injectable()
export class ClientListService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async list(
    actor: AuthUser,
    dto: ListClientsDto,
  ): Promise<{
    total: number;
    page: number;
    pageSize: number;
    rows: ClientRow[];
  }> {
    const store = scopedStoreId(actor);
    // $1: the store or null for every store.
    const visible = (
      a: string,
    ) => `${a}."deletedAt" IS NULL AND ($1::uuid IS NULL
      OR ${a}."storeId" = $1
      OR EXISTS (SELECT 1 FROM service_orders so WHERE so."clientId" = ${a}.id
                   AND so."storeId" = $1 AND so."deletedAt" IS NULL))`;
    const params: unknown[] = [store, !dto.archived];
    let search = '';
    const q = dto.q?.trim();
    if (q && q.length >= 2) {
      params.push(`%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);
      const term = `$${params.length}`;
      const digits = q.replace(/\D/g, '');
      let phone = '';
      if (/^[+\d\s().-]+$/.test(q) && digits.length >= 3) {
        params.push(`%${digits}%`);
        phone = ` OR regexp_replace(coalesce(c."phoneNumber", ''), '\\D', '', 'g') LIKE $${params.length}`;
      }
      search = `AND (trim(c."firstName" || ' ' || coalesce(c."lastName", '')) ILIKE ${term}
        OR c.email ILIKE ${term} OR c.dni ILIKE ${term} OR c."phoneNumber" ILIKE ${term}${phone})`;
    }
    params.push(CLIENT_PAGE_SIZE, (dto.page - 1) * CLIENT_PAGE_SIZE);
    const [limit, offset] = [`$${params.length - 1}`, `$${params.length}`];

    const rows = await this.db.query<(ClientRow & { total: string })[]>(
      `SELECT c.id, c."firstName", c."lastName", c."phoneNumber", c."dniType", c.dni,
              coalesce(o.orders, 0)::int AS orders, o."lastVisit",
              coalesce(o.balance, 0)::numeric(12,2)::text AS balance,
              EXISTS (
                SELECT 1 FROM client d
                 WHERE d.id <> c.id AND d."isActive" AND d."anonymizedAt" IS NULL AND ${visible('d')}
                   AND ((${phoneKey('d."phoneNumber"')} = ${phoneKey('c."phoneNumber"')})
                     OR (${docKey('d.dni')} = ${docKey('c.dni')}))
                   AND NOT ${dismissed('c', 'd')}
              ) AS duplicate,
              count(*) OVER () AS total
         FROM client c
         LEFT JOIN LATERAL (
           SELECT count(*) AS orders,
                  to_char(max(so."createdAt") AT TIME ZONE 'Europe/Madrid', 'YYYY-MM-DD') AS "lastVisit",
                  sum(so.balance) FILTER (WHERE so.status <> 'cancelado' AND so.balance > 0) AS balance
             FROM service_orders so
            WHERE so."clientId" = c.id AND so."deletedAt" IS NULL
              AND ($1::uuid IS NULL OR so."storeId" = $1)
         ) o ON true
        WHERE ${visible('c')} AND c."isActive" = $2 AND c."anonymizedAt" IS NULL ${search}
        ORDER BY o."lastVisit" DESC NULLS LAST, c."createdAt" DESC, c.id
        LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    return {
      total: Number(rows[0]?.total ?? 0),
      page: dto.page,
      pageSize: CLIENT_PAGE_SIZE,
      rows: rows.map(({ total: _total, ...row }) => {
        void _total;
        return row;
      }),
    };
  }

  /**
   * The figures, devices and order history of the client card. A store
   * counts only its own orders.
   */
  async summary(id: string, actor: AuthUser): Promise<ClientSummary> {
    if (!(await isClientVisible(this.db.manager, id, actor))) {
      throw new NotFoundException('Cliente no encontrado');
    }
    const p = [id, scopedStoreId(actor)];
    const mine = `so."clientId" = $1 AND so."deletedAt" IS NULL
      AND ($2::uuid IS NULL OR so."storeId" = $2)`;
    const local = (col: string) =>
      `to_char(${col} AT TIME ZONE 'Europe/Madrid', 'YYYY-MM-DD')`;
    const [stats] = await this.db.query<ClientSummary['stats'][]>(
      `SELECT count(*)::int AS orders,
              coalesce(sum(so."amountPaid"), 0)::numeric(12,2)::text AS spent,
              coalesce(sum(so.balance) FILTER (WHERE so.status <> 'cancelado' AND so.balance > 0), 0)::numeric(12,2)::text AS balance,
              (count(*) FILTER (WHERE so.status NOT IN ('entregado', 'cancelado')))::int AS open,
              ${local('max(so."createdAt")')} AS "lastVisit"
         FROM service_orders so WHERE ${mine}`,
      p,
    );
    const devices = await this.db.query<ClientSummary['devices']>(
      `SELECT d.id, d.type, d.brand, d.model, d.imei,
              (SELECT count(*)::int FROM service_orders so
                WHERE so."deviceId" = d.id AND ${mine}) AS orders
         FROM devices d
        WHERE d.client_id = $1
        ORDER BY orders DESC, d."createdAt" DESC`,
      p,
    );
    const rows = await this.db.query<
      (ClientSummary['history']['rows'][number] & { total: string })[]
    >(
      `SELECT so.id, so.code, d.model, so."reportedFaults" AS faults,
              ${local('so."createdAt"')} AS date, so.status,
              coalesce(so."totalPrice", 0)::numeric(12,2)::text AS "totalPrice",
              count(*) OVER () AS total
         FROM service_orders so LEFT JOIN devices d ON d.id = so."deviceId"
        WHERE ${mine}
        ORDER BY so."createdAt" DESC, so.id
        LIMIT ${CLIENT_HISTORY}`,
      p,
    );
    return {
      stats,
      devices,
      history: {
        total: Number(rows[0]?.total ?? 0),
        rows: rows.map(({ total: _total, ...row }) => {
          void _total;
          return row;
        }),
      },
    };
  }
}
