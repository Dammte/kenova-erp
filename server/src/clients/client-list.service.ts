import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../auth/auth.types';
import { scopedStoreId } from '../common/store-scope';
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
}
