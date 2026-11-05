import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In } from 'typeorm';
import type { AuthUser } from '../auth/auth.types';
import {
  assertClientVisible,
  assertDeviceVisible,
  scopedStoreId,
} from '../common/store-scope';
import { digitsSql, foldSql, likeTerms } from '../common/text-search';
import {
  OrderResult,
  ServiceOrder,
  ServiceStatus,
} from '../service-order/entities/service-order.entity';
import { toCents } from '../service-order/payment-status';
import { ServiceOrderService } from '../service-order/service-order.service';
import { Service } from '../services/entities/service.entity';
import { Store } from '../stores/entities/store.entity';
import type { CreateQuoteDto, UpdateQuoteDto } from './dto/create-quote.dto';
import {
  QUOTE_TABS,
  type ListQuotesDto,
  type QuoteTab,
} from './dto/list-quotes.dto';
import { QuoteLine } from './entities/quote-line.entity';
import {
  QUOTE_VALID_DAYS,
  Quote,
  type QuoteStatus,
} from './entities/quote.entity';
import { addDays, todayInSpain } from './quote-dates';

export const QUOTE_PAGE_SIZE = 50;

/** SQL for the status people see: a draft or sent quote past its date has expired. */
const statusSql = (alias: string) =>
  `CASE WHEN ${alias}.status IN ('draft', 'sent') AND ${alias}."validUntil" < :today THEN 'expired' ELSE ${alias}.status END`;

export interface QuoteRow {
  id: string;
  code: string;
  status: QuoteStatus;
  clientName: string;
  clientPhone: string;
  device: string;
  total: string;
  validUntil: string;
  createdAt: string;
}

export interface QuoteList {
  rows: QuoteRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Quotes per tab, regardless of the search. */
  counts: Record<QuoteTab, number>;
}

export interface QuoteDetail
  extends Omit<Quote, 'status' | 'createdBy' | 'order'> {
  status: QuoteStatus;
  lines: QuoteLine[];
  createdBy: { fullName: string } | null;
  /** The order it became once accepted, or was made for (design 2.4). */
  order: { id: string; code: string } | null;
}

/** A line whose price moved when the quote was renewed. */
export interface PriceChange {
  description: string;
  before: string;
  after: string;
}

const euros = (cents: number) => (cents / 100).toFixed(2);

/** Orders still in the workshop, the only ones a quote can be made for. */
const OPEN_ORDER: ServiceStatus[] = [
  ServiceStatus.EN_PROGRESO,
  ServiceStatus.PENDIENTE_CLIENTE,
  ServiceStatus.PENDIENTE_PIEZAS,
];

/** Why an order whose quote was turned down is returned unrepaired. */
export const QUOTE_REJECTED_REASON = 'El cliente no aceptó el presupuesto';

@Injectable()
export class QuotesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly orders: ServiceOrderService,
  ) {}

  async create(dto: CreateQuoteDto, actor: AuthUser): Promise<QuoteDetail> {
    const { id, order } = await this.dataSource.transaction(async (m) => {
      const order = dto.orderId
        ? await this.orderToQuote(m, dto.orderId, actor)
        : null;
      if (!order) await this.assertLinks(m, dto, actor);
      else await this.assertLinks(m, { lines: dto.lines }, actor);
      const storeId =
        order?.storeId ?? (await this.orders.storeIdFor(actor, m));
      const { number, code } = await takeNumber(m, storeId);
      const quote = await m.getRepository(Quote).save(
        m.getRepository(Quote).create({
          storeId,
          number,
          code,
          status: 'draft',
          // From an order, the client and device are the order's.
          clientId: order ? order.clientId : (dto.clientId ?? null),
          clientName: dto.clientName,
          clientPhone: dto.clientPhone,
          deviceId: order ? (order.deviceId ?? null) : (dto.deviceId ?? null),
          brand: dto.brand ?? null,
          model: dto.model,
          fault: dto.fault ?? null,
          diagnosticFee: dto.diagnosticFee?.toFixed(2) ?? null,
          validUntil: addDays(todayInSpain(), QUOTE_VALID_DAYS),
          orderId: order?.id ?? null,
          createdById: actor.id,
        }),
      );
      await this.replaceLines(m, quote, dto.lines);
      return { id: quote.id, order };
    });
    // The order waits for the client's answer (design 2.4).
    if (order && order.status !== ServiceStatus.PENDIENTE_CLIENTE) {
      await this.orders.update(
        order.id,
        { status: ServiceStatus.PENDIENTE_CLIENTE },
        actor,
      );
    }
    return this.findOne(id, actor);
  }

  async list(query: ListQuotesDto, actor: AuthUser): Promise<QuoteList> {
    const today = todayInSpain();
    const page = query.page ?? 1;
    const base = () => {
      const qb = this.dataSource
        .getRepository(Quote)
        .createQueryBuilder('q')
        .setParameter('today', today);
      const storeId = scopedStoreId(actor);
      if (storeId) qb.where('q.storeId = :storeId', { storeId });
      return qb;
    };

    const qb = base();
    const tab = query.tab ?? 'all';
    if (tab !== 'all') qb.andWhere(`${statusSql('q')} = :tab`, { tab });
    const terms = likeTerms(query.q ?? '');
    if (terms) {
      qb.andWhere(
        new Brackets((w) => {
          w.where(`${foldSql('q.code')} LIKE :term`)
            .orWhere(`${foldSql('q."clientName"')} LIKE :term`)
            .orWhere(
              `${foldSql(`concat_ws(' ', q.brand, q.model)`)} LIKE :term`,
            );
          if (terms.numeric) {
            w.orWhere(`${digitsSql('q."clientPhone"')} LIKE :numeric`);
          }
        }),
        terms,
      );
    }

    const total = await qb.clone().getCount();
    const rows = await qb
      .select([
        'q.id AS id',
        'q.code AS code',
        `${statusSql('q')} AS status`,
        'q."clientName" AS "clientName"',
        'q."clientPhone" AS "clientPhone"',
        `concat_ws(' ', q.brand, q.model) AS device`,
        'q.total AS total',
        `to_char(q."validUntil", 'YYYY-MM-DD') AS "validUntil"`,
        'q."createdAt" AS "createdAt"',
      ])
      .orderBy('q.createdAt', 'DESC')
      .offset((page - 1) * QUOTE_PAGE_SIZE)
      .limit(QUOTE_PAGE_SIZE)
      .getRawMany<QuoteRow>();

    const counted = await base()
      .select(statusSql('q'), 'status')
      .addSelect('count(*)::int', 'n')
      .groupBy('1')
      .getRawMany<{ status: QuoteStatus; n: number }>();
    const counts = Object.fromEntries(QUOTE_TABS.map((t) => [t, 0])) as Record<
      QuoteTab,
      number
    >;
    for (const { status, n } of counted) {
      counts[status] = n;
      counts.all += n;
    }
    return { rows, total, page, pageSize: QUOTE_PAGE_SIZE, counts };
  }

  async findOne(id: string, actor: AuthUser): Promise<QuoteDetail> {
    const quote = await this.load(this.dataSource.manager, id, actor);
    const lines = await this.dataSource.getRepository(QuoteLine).find({
      where: { quoteId: id },
      order: { position: 'ASC' },
    });
    const { createdBy, order, ...rest } = quote;
    return {
      ...rest,
      status: effectiveStatus(quote),
      lines,
      createdBy: createdBy ? { fullName: createdBy.fullName } : null,
      order: order ? { id: order.id, code: order.code } : null,
    };
  }

  /** Only a draft can change: a sent quote is what the client has in hand. */
  async update(
    id: string,
    dto: UpdateQuoteDto,
    actor: AuthUser,
  ): Promise<QuoteDetail> {
    await this.dataSource.transaction(async (m) => {
      const quote = await this.load(m, id, actor, true);
      if (quote.status !== 'draft') {
        throw new ConflictException(
          'Solo se puede cambiar un borrador. Renuévalo para hacer uno nuevo.',
        );
      }
      await this.assertLinks(m, dto, actor);
      const { lines, diagnosticFee, ...fields } = dto;
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) Object.assign(quote, { [key]: value });
      }
      if (diagnosticFee !== undefined) {
        quote.diagnosticFee = diagnosticFee?.toFixed(2) ?? null;
      }
      await m.getRepository(Quote).save(quote);
      if (lines) await this.replaceLines(m, quote, lines);
    });
    return this.findOne(id, actor);
  }

  /** Marks it as sent (WhatsApp or PDF); sending again keeps it sent with the new date. */
  async send(id: string, actor: AuthUser): Promise<QuoteDetail> {
    await this.dataSource.transaction(async (m) => {
      const quote = await this.load(m, id, actor, true);
      const status = effectiveStatus(quote);
      if (status !== 'draft' && status !== 'sent') {
        throw new ConflictException(
          status === 'expired'
            ? 'El presupuesto ha caducado: renuévalo antes de enviarlo'
            : 'Este presupuesto ya tiene respuesta del cliente',
        );
      }
      await m
        .getRepository(Quote)
        .update(id, { status: 'sent', sentAt: new Date() });
    });
    return this.findOne(id, actor);
  }

  /**
   * The client said yes to a quote made from an order: the order goes back
   * to work at the quoted price. Other quotes are accepted at intake.
   */
  async accept(id: string, actor: AuthUser): Promise<QuoteDetail> {
    const quote = await this.load(this.dataSource.manager, id, actor);
    if (!quote.orderId) {
      throw new ConflictException(
        'Este presupuesto no tiene orden: conviértelo en orden para aceptarlo',
      );
    }
    const status = effectiveStatus(quote);
    if (status === 'expired') {
      throw new ConflictException(
        'El presupuesto ha caducado: renuévalo antes de aceptarlo',
      );
    }
    const lines = await this.dataSource
      .getRepository(QuoteLine)
      .find({ where: { quoteId: id } });
    const serviceIds = [
      ...new Set(lines.flatMap((l) => (l.serviceId ? [l.serviceId] : []))),
    ];
    // Withdrawn rates cannot go on an order; their price stays in the total.
    const available = serviceIds.length
      ? (
          await this.dataSource.getRepository(Service).find({
            where: { id: In(serviceIds), available: true },
            select: { id: true },
          })
        ).map((s) => s.id)
      : [];
    await this.answer(quote, 'accepted', actor, {
      status: ServiceStatus.EN_PROGRESO,
      totalPrice: Number(quote.total),
      serviceIds: available,
    });
    return this.findOne(id, actor);
  }

  /**
   * The client said no. An expired quote can still be closed this way. Made
   * from an order, the device is returned unrepaired and only the diagnostic
   * is charged.
   */
  async reject(id: string, actor: AuthUser): Promise<QuoteDetail> {
    const quote = await this.load(this.dataSource.manager, id, actor);
    // An order closed some other way meanwhile is left as it is.
    const orderOpen = !!quote.order && OPEN_ORDER.includes(quote.order.status);
    await this.answer(
      quote,
      'rejected',
      actor,
      orderOpen
        ? {
            status: ServiceStatus.FINALIZADO,
            result: OrderResult.NOT_REPAIRED,
            notRepairedReason: QUOTE_REJECTED_REASON,
            totalPrice: Number(quote.diagnosticFee ?? 0),
          }
        : null,
    );
    return this.findOne(id, actor);
  }

  /**
   * Records the client's answer once (a second click finds it answered),
   * then applies it to the quote's order. If the order refuses the change,
   * the answer is undone so both stay as they were.
   */
  private async answer(
    quote: Quote,
    status: 'accepted' | 'rejected',
    actor: AuthUser,
    orderChange: Parameters<ServiceOrderService['update']>[1] | null,
  ): Promise<void> {
    if (orderChange && quote.orderId) {
      const order = await this.dataSource
        .getRepository(ServiceOrder)
        .findOne({ where: { id: quote.orderId }, select: { status: true } });
      if (!order || !OPEN_ORDER.includes(order.status)) {
        throw new ConflictException(
          'La orden de este presupuesto ya está cerrada',
        );
      }
    }
    const claimed = await this.dataSource
      .createQueryBuilder()
      .update(Quote)
      .set({ status, decidedAt: new Date() })
      .where('id = :id AND status IN (:...open)', {
        id: quote.id,
        open: ['draft', 'sent'],
      })
      .execute();
    if (!claimed.affected) {
      throw new ConflictException(
        'Este presupuesto ya tiene respuesta del cliente',
      );
    }
    if (!orderChange || !quote.orderId) return;
    try {
      await this.orders.update(quote.orderId, orderChange, actor);
    } catch (err) {
      await this.dataSource
        .getRepository(Quote)
        .update(quote.id, { status: quote.status, decidedAt: null });
      throw err;
    }
  }

  /**
   * Gives an expired quote 30 more days at today's prices. It goes back to
   * draft, to be checked and sent again; the answer lists the prices that moved.
   */
  async renew(
    id: string,
    actor: AuthUser,
  ): Promise<{ quote: QuoteDetail; changes: PriceChange[] }> {
    const changes = await this.dataSource.transaction(async (m) => {
      const quote = await this.load(m, id, actor, true);
      if (effectiveStatus(quote) !== 'expired') {
        throw new ConflictException('Solo se renueva un presupuesto caducado');
      }
      const lines = await m
        .getRepository(QuoteLine)
        .find({ where: { quoteId: id }, order: { position: 'ASC' } });
      const ids = lines.flatMap((l) => (l.serviceId ? [l.serviceId] : []));
      const rates = new Map(
        (ids.length
          ? await m.getRepository(Service).find({
              where: { id: In(ids), available: true },
              select: { id: true, price: true },
            })
          : []
        ).map((s) => [s.id, toCents(s.price)]),
      );
      const moved: PriceChange[] = [];
      for (const line of lines) {
        const now = line.serviceId ? rates.get(line.serviceId) : undefined;
        if (now === undefined || now === toCents(line.unitPrice)) continue;
        moved.push({
          description: line.description,
          before: line.unitPrice,
          after: euros(now),
        });
        line.unitPrice = euros(now);
      }
      await m.getRepository(QuoteLine).save(lines);
      await m.getRepository(Quote).update(id, {
        status: 'draft',
        sentAt: null,
        validUntil: addDays(todayInSpain(), QUOTE_VALID_DAYS),
        total: euros(lines.reduce((s, l) => s + toCents(l.unitPrice), 0)),
      });
      return moved;
    });
    return { quote: await this.findOne(id, actor), changes };
  }

  /**
   * An accepted quote already has its order, so it stays. Deleting an open
   * quote made from an order puts the order back to work.
   */
  async remove(id: string, actor: AuthUser): Promise<void> {
    const orderId = await this.dataSource.transaction(async (m) => {
      const quote = await this.load(m, id, actor, true);
      if (quote.status === 'accepted') {
        throw new ConflictException(
          'Un presupuesto aceptado ya tiene orden: cancélalo desde la orden',
        );
      }
      await m.getRepository(Quote).delete(id);
      return quote.status === 'rejected' ? null : quote.orderId;
    });
    if (!orderId) return;
    const order = await this.dataSource
      .getRepository(ServiceOrder)
      .findOne({ where: { id: orderId }, select: { status: true } });
    if (order?.status === ServiceStatus.PENDIENTE_CLIENTE) {
      await this.orders.update(
        orderId,
        { status: ServiceStatus.EN_PROGRESO },
        actor,
      );
    }
  }

  /** The order a quote is made for: visible, still in the workshop, no quote yet. */
  private async orderToQuote(
    m: EntityManager,
    orderId: string,
    actor: AuthUser,
  ): Promise<ServiceOrder> {
    const storeId = scopedStoreId(actor);
    const order = await m.getRepository(ServiceOrder).findOne({
      where: { id: orderId, ...(storeId ? { storeId } : {}) },
      lock: { mode: 'pessimistic_write' },
    });
    if (!order || order.deletedAt) {
      throw new NotFoundException('Orden no encontrada');
    }
    if (!OPEN_ORDER.includes(order.status)) {
      throw new ConflictException(
        'Solo se hace presupuesto de una orden que sigue en el taller',
      );
    }
    if (await m.getRepository(Quote).exists({ where: { orderId } })) {
      throw new ConflictException('Esta orden ya tiene presupuesto');
    }
    return order;
  }

  /** 404 unless the actor may see it; another store's quote is not revealed. */
  private async load(
    m: EntityManager,
    id: string,
    actor: AuthUser,
    lock = false,
  ): Promise<Quote> {
    const storeId = scopedStoreId(actor);
    const quote = await m.getRepository(Quote).findOne({
      where: { id, ...(storeId ? { storeId } : {}) },
      relations: lock ? {} : { createdBy: true, order: true },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!quote) throw new NotFoundException('Presupuesto no encontrado');
    return quote;
  }

  private async assertLinks(
    m: EntityManager,
    dto: UpdateQuoteDto,
    actor: AuthUser,
  ): Promise<void> {
    if (dto.clientId) await assertClientVisible(m, dto.clientId, actor);
    if (dto.deviceId) await assertDeviceVisible(m, dto.deviceId, actor);
    const ids = [
      ...new Set((dto.lines ?? []).flatMap((l) => l.serviceId ?? [])),
    ];
    if (ids.length) {
      const found = await m
        .getRepository(Service)
        .count({ where: { id: In(ids) } });
      if (found !== ids.length) {
        throw new BadRequestException('Alguna tarifa ya no existe');
      }
    }
  }

  /** Writes the lines in the order given and keeps the total equal to their sum. */
  private async replaceLines(
    m: EntityManager,
    quote: Quote,
    lines: NonNullable<UpdateQuoteDto['lines']>,
  ): Promise<void> {
    const repo = m.getRepository(QuoteLine);
    await repo.delete({ quoteId: quote.id });
    await repo.save(
      lines.map((l, position) =>
        repo.create({
          quoteId: quote.id,
          position,
          serviceId: l.serviceId ?? null,
          description: l.description,
          quality: l.quality ?? null,
          unitPrice: l.unitPrice.toFixed(2),
        }),
      ),
    );
    const total = lines.reduce((s, l) => s + toCents(l.unitPrice), 0);
    await m.getRepository(Quote).update(quote.id, { total: euros(total) });
  }
}

export function effectiveStatus(
  quote: Pick<Quote, 'status' | 'validUntil'>,
  today = todayInSpain(),
): QuoteStatus {
  const open = quote.status === 'draft' || quote.status === 'sent';
  return open && quote.validUntil < today ? 'expired' : quote.status;
}

/**
 * Takes the store's next quote number under the store row lock, like order
 * numbers, so two quotes never share one and a rolled-back quote gives it back.
 */
async function takeNumber(
  m: EntityManager,
  storeId: string,
): Promise<{ number: number; code: string }> {
  const result = await m
    .createQueryBuilder()
    .update(Store)
    .set({ nextQuoteNumber: () => '"nextQuoteNumber" + 1' })
    .where('id = :storeId AND "isActive"', { storeId })
    .returning(['nextQuoteNumber', 'prefix'])
    .execute();
  const row = (result.raw as { nextQuoteNumber: number; prefix: string }[])[0];
  if (!row) {
    throw new BadRequestException('La tienda no existe o está desactivada');
  }
  const number = row.nextQuoteNumber - 1;
  return {
    number,
    code: `${row.prefix}-P${String(number).padStart(4, '0')}`,
  };
}
