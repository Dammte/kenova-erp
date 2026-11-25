import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { Supplier } from '../entities/supplier.entity';
import {
  SupplierOrder,
  SupplierOrderLine,
  type SupplierOrderState,
} from '../entities/supplier-order.entity';
import { SuppliersService } from '../suppliers.service';
import { SupplierWebService } from '../web/supplier-web.service';
import type { WebOrder, WebOrderLine } from '../web/web-reader';

/** Order pages read per «Sincronizar», so a long gap does not hammer the supplier's website. */
export const MAX_PAGES_PER_SYNC = 20;
export const PAGE_SIZE = 50;

export interface SyncResult {
  /** New orders now in the log. */
  added: number;
  /** Orders already in the log whose supplier data changed (status, invoice…). */
  updated: number;
  /** New orders left for the next «Sincronizar» (over MAX_PAGES_PER_SYNC). */
  waiting: number;
  /** First reading: what was already in the history counts as received before the ERP. */
  firstSync: boolean;
}

export interface OrderListQuery {
  supplierId?: string;
  state?: SupplierOrderState;
  /** Part of the reference, or of a line's reference or description. */
  q?: string;
  page?: number;
}

/** States a person picks; RECIBIDO only comes from receiving the parcel. */
export type ChosenState = Exclude<SupplierOrderState, 'RECIBIDO'>;

const cut = (s: string | null, n: number) => (s ? s.slice(0, n) : null);

/** The supplier data of an order, as the log keeps it. */
const orderFields = (o: WebOrder) => ({
  reference: o.reference.slice(0, 40),
  orderDate: o.date,
  total: o.total,
  payment: cut(o.payment, 80),
  supplierStatus: cut(o.status, 80),
  invoiceUrl: cut(o.invoiceUrl, 500),
  detailUrl: o.detailUrl.slice(0, 500),
});

const lineRows = (orderId: string, lines: WebOrderLine[]) =>
  lines.map((l, position) => ({
    orderId,
    position,
    description: l.description,
    ref: l.ref,
    productUrl: cut(l.productUrl, 500),
    quantity: l.quantity!,
    unitPrice: l.unitPrice,
    lineTotal: l.lineTotal,
  }));

/**
 * The log of orders bought on suppliers' websites. «Sincronizar» reads the
 * website first and writes after, all in one go: if anything fails, nothing
 * is saved. Each order is kept once (supplier + its id there).
 */
@Injectable()
export class SupplierOrdersService {
  constructor(
    @InjectRepository(SupplierOrder)
    private readonly orders: Repository<SupplierOrder>,
    @InjectDataSource() private readonly db: DataSource,
    private readonly suppliers: SuppliersService,
    private readonly web: SupplierWebService,
    private readonly audit: AuditService,
  ) {}

  async sync(supplierId: string, actorId: string): Promise<SyncResult> {
    const supplier = await this.suppliers.findOne(supplierId);
    if (!supplier.active) {
      throw new BadRequestException(
        'El proveedor está desactivado. Reactívalo para sincronizar.',
      );
    }
    const known = await this.knownIds(this.db.manager, supplierId);
    const firstSync = known.size === 0;

    // 1. Read: the history, then the pages of the new orders.
    const site = await this.web.open(supplierId);
    const history = await this.web.run(() => site.history());
    if (!history.length && !firstSync) {
      throw new BadRequestException(
        'No se ha encontrado ningún pedido en el historial del proveedor. Revisa «Filas del historial» en la conexión. No se ha guardado nada.',
      );
    }
    const seen = new Set<string>();
    const listed = history.filter(
      (o) => !seen.has(o.externalId) && seen.add(o.externalId),
    );
    const fresh = listed.filter((o) => !known.has(o.externalId));
    // The first time, the history is the past: no pages are read.
    const toRead = firstSync ? [] : fresh.slice(0, MAX_PAGES_PER_SYNC);
    const pages = new Map<string, WebOrderLine[]>();
    for (const o of toRead) {
      const lines = await this.web.run(() => site.lines(o.externalId));
      if (!lines.length) {
        throw new BadRequestException(
          `No se leen las líneas del pedido ${o.reference}. Revisa «Filas del pedido», «Producto» y «Cantidad» en la conexión. No se ha guardado nada.`,
        );
      }
      pages.set(o.externalId, lines);
    }
    const adding = firstSync ? fresh : toRead;

    // 2. Write, all or nothing.
    return this.db.transaction(async (m) => {
      // Two «Sincronizar» at once: the second waits and skips what the first saved.
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `supplier-orders:${supplierId}`,
      ]);
      const existing = await m.find(SupplierOrder, { where: { supplierId } });
      const byId = new Map(existing.map((o) => [o.externalId, o]));
      let added = 0;
      let updated = 0;
      const now = new Date();
      for (const o of adding) {
        if (byId.has(o.externalId)) continue;
        const lines = pages.get(o.externalId);
        const row = await m.save(
          m.create(SupplierOrder, {
            supplierId,
            externalId: o.externalId.slice(0, 40),
            ...orderFields(o),
            state: firstSync ? 'ANTERIOR' : 'PENDIENTE',
            linesReadAt: lines ? now : null,
          }),
        );
        if (lines) await m.insert(SupplierOrderLine, lineRows(row.id, lines));
        added++;
      }
      for (const o of listed) {
        const row = byId.get(o.externalId);
        if (!row) continue;
        const fields = orderFields(o);
        const changed = (Object.keys(fields) as (keyof typeof fields)[]).filter(
          (k) => fields[k] !== row[k],
        );
        if (!changed.length) continue;
        await m.update(SupplierOrder, row.id, fields);
        updated++;
      }
      await m.update(Supplier, supplierId, { ordersSyncedAt: now });
      const result: SyncResult = {
        added,
        updated,
        waiting: fresh.length - adding.length,
        firstSync,
      };
      await this.audit.record(
        {
          action: 'SUPPLIER_ORDERS_SYNCED',
          actorUserId: actorId,
          entityType: 'supplier',
          entityId: supplierId,
          metadata: { ...result },
        },
        m,
      );
      return result;
    });
  }

  /** Newest first, 50 a page, with how many there are in each state. */
  async list(query: OrderListQuery) {
    const page = Math.max(1, query.page ?? 1);
    const base = this.orders.createQueryBuilder('o');
    if (query.supplierId)
      base.andWhere('o.supplierId = :sid', { sid: query.supplierId });
    const q = query.q?.trim();
    if (q) {
      base.andWhere(
        `(o.reference ILIKE :q OR EXISTS (SELECT 1 FROM supplier_order_lines l
           WHERE l."orderId" = o.id AND (l.ref ILIKE :q OR l.description ILIKE :q)))`,
        { q: `%${q.replace(/[\\%_]/g, '\\$&')}%` },
      );
    }
    const counts = await base
      .clone()
      .select('o.state', 'state')
      .addSelect('count(*)::int', 'count')
      .groupBy('o.state')
      .getRawMany<{ state: SupplierOrderState; count: number }>();
    if (query.state) base.andWhere('o.state = :state', { state: query.state });
    const [items, total] = await base
      .leftJoin('o.supplier', 's')
      .addSelect(['s.id', 's.name'])
      .orderBy('o.orderDate', 'DESC', 'NULLS LAST')
      .addOrderBy('o.createdAt', 'DESC')
      .addOrderBy('o.id', 'DESC')
      .skip((page - 1) * PAGE_SIZE)
      .take(PAGE_SIZE)
      .getManyAndCount();
    return {
      items,
      total,
      page,
      pageSize: PAGE_SIZE,
      counts: Object.fromEntries(counts.map((c) => [c.state, c.count])),
    };
  }

  async findOne(id: string): Promise<SupplierOrder> {
    const found = await this.orders
      .createQueryBuilder('o')
      .leftJoin('o.supplier', 's')
      .addSelect(['s.id', 's.name'])
      .leftJoinAndSelect('o.lines', 'l')
      .where('o.id = :id', { id })
      .orderBy('l.position', 'ASC')
      .getOne();
    if (!found) throw new NotFoundException('Pedido no encontrado');
    return found;
  }

  /**
   * «Pendiente de recibir», «Descartar» or «Ya lo tenía». An order made
   * pending has its lines read first if it had none.
   */
  async setState(
    id: string,
    state: ChosenState,
    actorId: string,
  ): Promise<SupplierOrder> {
    const order = await this.findOne(id);
    if (order.state === 'RECIBIDO') {
      throw new ConflictException(
        'El pedido ya está recibido: su stock ya entró y no cambia de estado.',
      );
    }
    if (order.state === state) return order;
    const lines =
      state === 'PENDIENTE' && !order.linesReadAt
        ? await this.readLines(order)
        : null;
    await this.db.transaction(async (m) => {
      if (lines) await this.replaceLines(m, order.id, lines);
      await m.update(SupplierOrder, order.id, { state });
      await this.audit.record(
        {
          action: 'SUPPLIER_ORDER_STATE_CHANGED',
          actorUserId: actorId,
          entityType: 'supplier_order',
          entityId: order.id,
          metadata: {
            reference: order.reference,
            from: order.state,
            to: state,
          },
        },
        m,
      );
    });
    return this.findOne(id);
  }

  /** «Leer líneas»: reads the order's page again (only before it is received). */
  async refreshLines(id: string): Promise<SupplierOrder> {
    const order = await this.findOne(id);
    if (order.state === 'RECIBIDO') {
      throw new ConflictException(
        'El pedido ya está recibido: sus líneas se quedan como se recibieron.',
      );
    }
    const lines = await this.readLines(order);
    await this.db.transaction((m) => this.replaceLines(m, order.id, lines));
    return this.findOne(id);
  }

  private async readLines(order: SupplierOrder): Promise<WebOrderLine[]> {
    const site = await this.web.open(order.supplierId);
    const lines = await this.web.run(() => site.lines(order.externalId));
    if (!lines.length) {
      throw new BadRequestException(
        `No se leen las líneas del pedido ${order.reference}. Revisa «Filas del pedido», «Producto» y «Cantidad» en la conexión.`,
      );
    }
    return lines;
  }

  private async replaceLines(
    m: EntityManager,
    orderId: string,
    lines: WebOrderLine[],
  ) {
    await m.delete(SupplierOrderLine, { orderId });
    await m.insert(SupplierOrderLine, lineRows(orderId, lines));
    await m.update(SupplierOrder, orderId, { linesReadAt: new Date() });
  }

  private async knownIds(m: EntityManager, supplierId: string) {
    const rows = await m.find(SupplierOrder, {
      where: { supplierId },
      select: { externalId: true },
    });
    return new Set(rows.map((r) => r.externalId));
  }
}
