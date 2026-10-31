import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ListInventoryDto } from './dto/list-inventory.dto';

export const INVENTORY_PAGE_SIZE = 50;

/** out: none left; low: under its minimum; ok: enough. */
export type StockStatus = 'out' | 'low' | 'ok';

export interface InventoryRow {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  brand: string | null;
  /** The models it fits («Compatible»). */
  model: string | null;
  ubication: string | null;
  provider: string | null;
  stock: number;
  minimalStock: number;
  status: StockStatus;
  salesPrice: string | null;
  costPrice: string | null;
}

export interface InventoryPage {
  total: number;
  page: number;
  pageSize: number;
  rows: InventoryRow[];
  /** For the filter chips; they ignore the chip filters themselves. */
  counts: { all: number; low: number; byCategory: Record<string, number> };
  /** For the «Marca» and «Proveedor» menus. */
  brands: string[];
  providers: string[];
}

const STOCK = `coalesce(i.stock, 0)`;
const MIN = `coalesce(i."minimalStock", 0)`;
/** Out of stock, or under the minimum that was set. */
const LOW = `(${STOCK} = 0 OR ${STOCK} < ${MIN})`;

/**
 * Design 3.4 «Repuestos»: the parts list with its filters. Stock is the
 * partners' only (decision 5), so there is no store scope here.
 */
@Injectable()
export class InventoryListService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async list(dto: ListInventoryDto): Promise<InventoryPage> {
    const params: unknown[] = [];
    const p = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    // Search, brand and provider narrow everything, the chips included.
    const base: string[] = [`i."deletedAt" IS NULL`];
    const q = dto.q?.trim();
    if (q) {
      const like = p(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
      base.push(
        `(i.sku ILIKE ${like} OR i.name ILIKE ${like} OR i.model ILIKE ${like} OR i.brand ILIKE ${like})`,
      );
    }
    if (dto.brand) base.push(`i.brand = ${p(dto.brand)}`);
    if (dto.provider) base.push(`i.provider = ${p(dto.provider)}`);
    const where = base.join(' AND ');
    const baseParams = [...params];

    const chips: string[] = [];
    if (dto.category) chips.push(`i.category = ${p(dto.category)}`);
    if (dto.low) chips.push(LOW);
    const listWhere = [where, ...chips].join(' AND ');

    const page = dto.page ?? 1;
    const [rows, [{ total }], counts, menus] = await Promise.all([
      this.db.query<InventoryRow[]>(
        `SELECT i.id, i.sku, i.name, i.category, i.brand, i.model, i.ubication, i.provider,
                ${STOCK} AS stock, ${MIN} AS "minimalStock",
                CASE WHEN ${STOCK} = 0 THEN 'out' WHEN ${STOCK} < ${MIN} THEN 'low' ELSE 'ok' END AS status,
                i."salesPrice"::numeric(12,2)::text AS "salesPrice",
                i."costPrice"::numeric(12,2)::text AS "costPrice"
           FROM inventory i
          WHERE ${listWhere}
          ORDER BY i.name, i.sku
          LIMIT ${INVENTORY_PAGE_SIZE} OFFSET ${(page - 1) * INVENTORY_PAGE_SIZE}`,
        params,
      ),
      this.db.query<{ total: number }[]>(
        `SELECT count(*)::int AS total FROM inventory i WHERE ${listWhere}`,
        params,
      ),
      this.db.query<{ category: string | null; n: number; low: number }[]>(
        `SELECT i.category, count(*)::int AS n, count(*) FILTER (WHERE ${LOW})::int AS low
           FROM inventory i WHERE ${where} GROUP BY i.category`,
        baseParams,
      ),
      this.db.query<{ brands: string[] | null; providers: string[] | null }[]>(
        `SELECT array_agg(DISTINCT i.brand ORDER BY i.brand) FILTER (WHERE i.brand <> '') AS brands,
                array_agg(DISTINCT i.provider ORDER BY i.provider) FILTER (WHERE i.provider <> '') AS providers
           FROM inventory i WHERE i."deletedAt" IS NULL`,
      ),
    ]);

    const byCategory: Record<string, number> = {};
    let all = 0;
    let low = 0;
    for (const c of counts) {
      all += c.n;
      low += c.low;
      if (c.category) byCategory[c.category] = c.n;
    }
    return {
      total,
      page,
      pageSize: INVENTORY_PAGE_SIZE,
      rows,
      counts: { all, low, byCategory },
      brands: menus[0]?.brands ?? [],
      providers: menus[0]?.providers ?? [],
    };
  }
}
