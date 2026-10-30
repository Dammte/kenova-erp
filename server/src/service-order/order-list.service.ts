import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Brackets, DataSource, In, SelectQueryBuilder } from 'typeorm';
import type { AuthUser } from '../auth/auth.types';
import { Brand } from '../brands/entities/brand.entity';
import { scopedStoreId } from '../common/store-scope';
import { digitsSql, foldSql, likeTerms } from '../common/text-search';
import type { ListOrdersDto, OrderTab } from './dto/list-orders.dto';
import { OrderLine, OrderLineKind } from './entities/order-line.entity';
import { ServiceOrder, ServiceStatus } from './entities/service-order.entity';

export const PAGE_SIZE = 50;

/** Orders still in the shop: everything not delivered or cancelled. */
const OPEN: ServiceStatus[] = [
  ServiceStatus.EN_PROGRESO,
  ServiceStatus.PENDIENTE_CLIENTE,
  ServiceStatus.PENDIENTE_PIEZAS,
  ServiceStatus.FINALIZADO,
];

const DAY_MS = 24 * 60 * 60 * 1000;

export interface OrderRow {
  id: string;
  code: string;
  status: ServiceStatus;
  priority: string;
  clientName: string;
  phoneNumber: string | null;
  device: string;
  faults: string[];
  services: string[];
  totalPrice: number;
  balance: number;
  paymentStatus: string | null;
  createdAt: string;
  /**
   * Days in the shop; for a finished order, days waiting to be collected
   * (`uncollected`). Null once delivered or cancelled.
   */
  days: number | null;
  uncollected: boolean;
}

export interface OrderList {
  rows: OrderRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Orders per tab, regardless of the search and filters. */
  counts: Record<OrderTab, number>;
}

interface RawRow {
  id: string;
  code: string;
  status: ServiceStatus;
  priority: string;
  firstName: string;
  lastName: string | null;
  phoneNumber: string | null;
  brand: string | null;
  model: string | null;
  faults: string[] | null;
  totalPrice: string | null;
  balance: string | null;
  paymentStatus: string | null;
  createdAt: Date;
  finishedAt: Date | null;
}

/** Design 1.4: the order list with its tabs, search, filters and pages. */
@Injectable()
export class OrderListService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(query: ListOrdersDto, actor: AuthUser): Promise<OrderList> {
    const page = query.page ?? 1;
    const base = () => {
      // withDeleted keeps orders of archived clients; deleted orders are
      // filtered explicitly.
      const qb = this.dataSource
        .getRepository(ServiceOrder)
        .createQueryBuilder('o')
        .withDeleted()
        .where('o.deletedAt IS NULL');
      const storeId = scopedStoreId(actor);
      if (storeId) qb.andWhere('o.storeId = :storeId', { storeId });
      return qb;
    };

    const qb = base()
      .innerJoin('o.client', 'c')
      .leftJoin('o.device', 'd')
      // Older devices keep the brand's id instead of its name.
      .leftJoin(Brand, 'b', 'b.id::text = d.brand');
    const tab = query.tab ?? 'open';
    if (tab === 'open') qb.andWhere('o.status IN (:...open)', { open: OPEN });
    else if (tab !== 'all') qb.andWhere('o.status = :tab', { tab });
    if (query.debt) qb.andWhere('coalesce(o.balance, 0) > 0');

    const terms = likeTerms(query.q ?? '');
    if (terms) {
      qb.andWhere(
        new Brackets((w) => {
          w.where(`${foldSql('o.code')} LIKE :term`)
            .orWhere(
              `${foldSql('c."firstName"')} || ' ' || ${foldSql('c."lastName"')} LIKE :term`,
            )
            .orWhere(
              `${foldSql('coalesce(b.name, d.brand)')} || ' ' || ${foldSql('d.model')} LIKE :term`,
            )
            .orWhere(`${foldSql('d.model')} LIKE :term`);
          if (terms.numeric) {
            w.orWhere(`${digitsSql('c."phoneNumber"')} LIKE :numeric`).orWhere(
              `${digitsSql('d.imei')} LIKE :numeric`,
            );
          }
        }),
        terms,
      );
    }

    if (tab === 'open' || OPEN.includes(tab as ServiceStatus)) {
      // Most urgent first, then the oldest.
      qb.orderBy(
        `CASE o.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`,
      ).addOrderBy('o.createdAt', 'ASC');
    } else {
      qb.orderBy('o.createdAt', 'DESC');
    }

    const total = await qb.clone().getCount();
    const raw = await qb
      .select([
        'o.id AS id',
        'o.code AS code',
        'o.status AS status',
        'o.priority AS priority',
        'c."firstName" AS "firstName"',
        'c."lastName" AS "lastName"',
        'c."phoneNumber" AS "phoneNumber"',
        'coalesce(b.name, d.brand) AS brand',
        'd.model AS model',
        'o."reportedFaults" AS faults',
        'o."totalPrice" AS "totalPrice"',
        'o.balance AS balance',
        'o."paymentStatus" AS "paymentStatus"',
        'o."createdAt" AS "createdAt"',
        'o."finishedAt" AS "finishedAt"',
      ])
      .offset((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .getRawMany<RawRow>();

    const services = await this.servicesOf(raw.map((r) => r.id));
    const counts = await this.counts(base());
    const now = Date.now();
    return {
      rows: raw.map((r) => toRow(r, services.get(r.id) ?? [], now)),
      total,
      page,
      pageSize: PAGE_SIZE,
      counts,
    };
  }

  /** The service lines of each order, in their order on the ticket. */
  private async servicesOf(ids: string[]): Promise<Map<string, string[]>> {
    const byOrder = new Map<string, string[]>();
    if (ids.length === 0) return byOrder;
    const lines = await this.dataSource.getRepository(OrderLine).find({
      where: { orderId: In(ids), kind: OrderLineKind.SERVICE },
      select: { orderId: true, description: true, position: true },
      order: { position: 'ASC' },
    });
    for (const l of lines) {
      byOrder.set(l.orderId, [
        ...(byOrder.get(l.orderId) ?? []),
        l.description,
      ]);
    }
    return byOrder;
  }

  private async counts(
    qb: SelectQueryBuilder<ServiceOrder>,
  ): Promise<Record<OrderTab, number>> {
    const rows = await qb
      .select('o.status', 'status')
      .addSelect('count(*)::int', 'n')
      .groupBy('o.status')
      .getRawMany<{ status: ServiceStatus; n: number }>();
    const counts = Object.fromEntries(
      ['open', 'all', ...Object.values(ServiceStatus)].map((t) => [t, 0]),
    ) as Record<OrderTab, number>;
    for (const { status, n } of rows) {
      counts[status] = n;
      counts.all += n;
      if (OPEN.includes(status)) counts.open += n;
    }
    return counts;
  }
}

function toRow(r: RawRow, services: string[], now: number): OrderRow {
  const finished = r.status === ServiceStatus.FINALIZADO;
  const since = finished ? (r.finishedAt ?? r.createdAt) : r.createdAt;
  const days = OPEN.includes(r.status)
    ? Math.max(0, Math.floor((now - new Date(since).getTime()) / DAY_MS))
    : null;
  return {
    id: r.id,
    code: r.code,
    status: r.status,
    priority: r.priority,
    clientName: [r.firstName, r.lastName].filter(Boolean).join(' '),
    phoneNumber: r.phoneNumber,
    device: [r.brand, r.model].filter(Boolean).join(' '),
    faults: r.faults ?? [],
    services,
    totalPrice: Number(r.totalPrice ?? 0),
    balance: Number(r.balance ?? 0),
    paymentStatus: r.paymentStatus,
    createdAt: new Date(r.createdAt).toISOString(),
    days,
    uncollected: finished,
  };
}
