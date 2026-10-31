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
  /** The order it became, once accepted. */
  order: { id: string; code: string } | null;
}

/** A line whose price moved when the quote was renewed. */
export interface PriceChange {
  description: string;
  before: string;
  after: string;
}

const euros = (cents: number) => (cents / 100).toFixed(2);

@Injectable()
export class QuotesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly orders: ServiceOrderService,
  ) {}

  async create(dto: CreateQuoteDto, actor: AuthUser): Promise<QuoteDetail> {
    const id = await this.dataSource.transaction(async (m) => {
      await this.assertLinks(m, dto, actor);
      const storeId = await this.orders.storeIdFor(actor, m);
      const { number, code } = await takeNumber(m, storeId);
      const quote = await m.getRepository(Quote).save(
        m.getRepository(Quote).create({
          storeId,
          number,
          code,
          status: 'draft',
          clientId: dto.clientId ?? null,
          clientName: dto.clientName,
          clientPhone: dto.clientPhone,
          deviceId: dto.deviceId ?? null,
          brand: dto.brand ?? null,
          model: dto.model,
          fault: dto.fault ?? null,
          diagnosticFee: dto.diagnosticFee?.toFixed(2) ?? null,
          validUntil: addDays(todayInSpain(), QUOTE_VALID_DAYS),
          createdById: actor.id,
        }),
      );
      await this.replaceLines(m, quote, dto.lines);
      return quote.id;
    });
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

  /** The client said no. An expired quote can still be closed this way. */
  async reject(id: string, actor: AuthUser): Promise<QuoteDetail> {
    await this.dataSource.transaction(async (m) => {
      const quote = await this.load(m, id, actor, true);
      if (quote.status !== 'draft' && quote.status !== 'sent') {
        throw new ConflictException(
          'Este presupuesto ya tiene respuesta del cliente',
        );
      }
      await m
        .getRepository(Quote)
        .update(id, { status: 'rejected', decidedAt: new Date() });
    });
    return this.findOne(id, actor);
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

  /** An accepted quote already has its order, so it stays. */
  async remove(id: string, actor: AuthUser): Promise<void> {
    await this.dataSource.transaction(async (m) => {
      const quote = await this.load(m, id, actor, true);
      if (quote.status === 'accepted') {
        throw new ConflictException(
          'Un presupuesto aceptado ya tiene orden: cancélalo desde la orden',
        );
      }
      await m.getRepository(Quote).delete(id);
    });
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
