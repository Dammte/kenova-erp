import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, LessThan, MoreThan, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import { AuthService } from '../auth/auth.service';
import { PaymentMethod } from '../service-order/entities/service-order.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateStoreDto } from './dto/create-store.dto';
import { SettleCommissionDto } from './dto/settle-commission.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { CommissionSettlement } from './entities/commission-settlement.entity';
import { StoreCommissionChange } from './entities/store-commission-change.entity';
import { CommissionType, Store } from './entities/store.entity';

/** One delivered order of the month and the commission frozen on it. */
export interface CommissionLine {
  orderId: string;
  orderCode: string;
  deliveredAt: Date;
  clientName: string;
  device: string | null;
  amountPaid: string;
  commissionType: CommissionType;
  commissionValue: string;
  commissionAmount: string;
  warranty: boolean;
}

/** A partner store's month: what it collected, what it keeps, what it hands over. */
export interface CommissionMonth {
  month: string;
  store: { id: string; name: string };
  lines: CommissionLine[];
  collected: string;
  commission: string;
  toKenova: string;
  /** Left pending by the previous settlement. */
  carriedIn: string;
  /** toKenova + carriedIn: what the store has to hand over. */
  due: string;
  /** The month's settlement, once recorded (its totals as they stood then). */
  settlement: SettlementView | null;
}

export interface SettlementView {
  id: string;
  month: string;
  collected: string;
  commission: string;
  toKenova: string;
  carriedIn: string;
  due: string;
  received: string;
  /** due − received: carried to the next settlement. */
  pending: string;
  receivedOn: string;
  method: PaymentMethod;
  note: string | null;
  createdBy: { id: string; fullName: string } | null;
  createdAt: Date;
}

/** This month in Madrid, as AAAA-MM. */
const thisMonth = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const euros = (cents: number) => (cents / 100).toFixed(2);
const cents = (value: string | number | null) =>
  Math.round(Number(value ?? 0) * 100);

@Injectable()
export class StoresService {
  constructor(
    @InjectRepository(Store) private readonly stores: Repository<Store>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(StoreCommissionChange)
    private readonly commissionChanges: Repository<StoreCommissionChange>,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  /** A store admin only ever sees its own store. */
  async findAll(actor: AuthUser): Promise<Store[]> {
    const all = actor.role === UserRole.SUPER_ADMIN;
    if (!all && !actor.storeId) return [];
    return this.stores.find({
      where: all ? {} : { id: actor.storeId! },
      order: { isMain: 'DESC', name: 'ASC' },
    });
  }

  async findOne(id: string, actor: AuthUser): Promise<Store> {
    const store = await this.stores.findOne({ where: { id } });
    // Another store's id answers exactly like a missing one.
    if (
      !store ||
      (actor.role !== UserRole.SUPER_ADMIN && actor.storeId !== store.id)
    ) {
      throw new NotFoundException('Tienda no encontrada');
    }
    return store;
  }

  /** The workshop: the default store for new store accounts. */
  findMain(): Promise<Store | null> {
    return this.stores.findOne({ where: { isMain: true } });
  }

  /** "09:00" and "09:00:00" compare alike. */
  private static checkCashHours(opens: string, closes: string): void {
    if (closes.slice(0, 5) <= opens.slice(0, 5)) {
      throw new BadRequestException(
        'La hora de cierre debe ser posterior a la de apertura.',
      );
    }
  }

  /**
   * The commission a request leaves the store with, or undefined when it does
   * not touch it. Type and value always go together; the workshop has none.
   */
  private static nextCommission(
    dto: CreateStoreDto | UpdateStoreDto,
    isMain: boolean,
  ): { type: CommissionType | null; value: string | null } | undefined {
    const { commissionType: type, commissionValue: value } = dto;
    if (type === undefined && value === undefined) return undefined;
    if ((type ?? null) === null && (value ?? null) === null) {
      return { type: null, value: null };
    }
    if (!type || value === undefined || value === null) {
      throw new BadRequestException('Indica el tipo y el valor de la comisión');
    }
    if (isMain) {
      throw new BadRequestException('La tienda principal no lleva comisión');
    }
    if (type === CommissionType.PERCENT && value > 100) {
      throw new BadRequestException('El porcentaje no puede pasar de 100');
    }
    return { type, value: value.toFixed(2) };
  }

  /** Commission history of a store, newest first. */
  async commissionHistory(
    id: string,
    actor: AuthUser,
  ): Promise<StoreCommissionChange[]> {
    await this.findOne(id, actor);
    const rows = await this.commissionChanges.find({
      where: { storeId: id },
      relations: { changedBy: true },
      order: { createdAt: 'DESC' },
    });
    for (const r of rows) {
      if (r.changedBy) {
        const { id: userId, fullName } = r.changedBy;
        r.changedBy = { id: userId, fullName } as User;
      }
    }
    return rows;
  }

  /**
   * Design R2 3.14 «Comisiones»: the orders the store delivered in the month
   * (Madrid time), each with the commission frozen at delivery, and the
   * totals. A store sees only its own; the workshop has no commission.
   */
  async commissionMonth(
    id: string,
    month: string | undefined,
    actor: AuthUser,
  ): Promise<CommissionMonth> {
    const store = await this.findOne(id, actor);
    if (store.isMain) {
      throw new BadRequestException('La tienda principal no lleva comisión');
    }
    const asked = StoresService.checkMonth(month ?? thisMonth());
    return this.monthOf(store, asked);
  }

  /** The month's totals and lines, the pending balance and its settlement. */
  private async monthOf(
    store: Store,
    asked: string,
    m: EntityManager = this.stores.manager,
  ): Promise<CommissionMonth> {
    const rows: {
      orderId: string;
      orderCode: string;
      deliveredAt: Date;
      clientName: string;
      device: string | null;
      amountPaid: string | null;
      commissionType: CommissionType;
      commissionValue: string;
      commissionAmount: string;
      warranty: boolean;
    }[] = await m.query(
      `SELECT o.id AS "orderId", o.code AS "orderCode", o."deliveredAt",
              trim(concat_ws(' ', c."firstName", c."lastName")) AS "clientName",
              CASE WHEN d.id IS NULL THEN NULL
                   ELSE concat_ws(' ', d.brand, d.model) END AS device,
              o."amountPaid", o."commissionType", o."commissionValue",
              o."commissionAmount", o."warrantyOfId" IS NOT NULL AS warranty
         FROM service_orders o
         LEFT JOIN client c ON c.id = o."clientId"
         LEFT JOIN devices d ON d.id = o."deviceId"
        WHERE o."storeId" = $1
          AND o."deletedAt" IS NULL
          AND o."commissionAmount" IS NOT NULL
          AND o."deliveredAt" >= ($2::date)::timestamp AT TIME ZONE 'Europe/Madrid'
          AND o."deliveredAt" < (($2::date) + interval '1 month')::timestamp
                                 AT TIME ZONE 'Europe/Madrid'
        ORDER BY o."deliveredAt", o.code`,
      [store.id, `${asked}-01`],
    );

    const lines = rows.map((r) => ({
      ...r,
      amountPaid: r.amountPaid ?? '0.00',
    }));
    const collected = lines.reduce((sum, l) => sum + cents(l.amountPaid), 0);
    const commission = lines.reduce(
      (sum, l) => sum + cents(l.commissionAmount),
      0,
    );
    const settlements = m.getRepository(CommissionSettlement);
    const [settled, previous] = await Promise.all([
      settlements.findOne({
        where: { storeId: store.id, month: asked },
        relations: { createdBy: true },
      }),
      settlements.findOne({
        where: { storeId: store.id, month: LessThan(asked) },
        order: { month: 'DESC' },
      }),
    ]);
    const carriedIn = previous
      ? cents(previous.due) - cents(previous.received)
      : 0;
    const toKenova = collected - commission;
    return {
      month: asked,
      store: { id: store.id, name: store.name },
      lines,
      collected: euros(collected),
      commission: euros(commission),
      toKenova: euros(toKenova),
      carriedIn: euros(carriedIn),
      due: euros(toKenova + carriedIn),
      settlement: settled ? StoresService.settlementView(settled) : null,
    };
  }

  /**
   * Records what a partner store handed over for a finished month. The totals
   * are copied as they stand; what is missing carries to the next month.
   * Months are settled in order, so the pending balance always adds up.
   */
  async settleMonth(
    id: string,
    month: string,
    dto: SettleCommissionDto,
    actorId: string,
  ): Promise<SettlementView> {
    const asked = StoresService.checkMonth(month);
    if (asked >= thisMonth()) {
      throw new BadRequestException(
        'El mes aún no ha terminado: se liquida a partir del día 1 del siguiente',
      );
    }
    const saved = await this.stores.manager.transaction(async (m) => {
      // One settlement at a time per store.
      const store = await m.getRepository(Store).findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!store) throw new NotFoundException('Tienda no encontrada');
      if (store.isMain) {
        throw new BadRequestException('La tienda principal no lleva comisión');
      }
      const settlements = m.getRepository(CommissionSettlement);
      if (await settlements.exists({ where: { storeId: id, month: asked } })) {
        throw new ConflictException('Este mes ya está liquidado');
      }
      if (
        await settlements.exists({
          where: { storeId: id, month: MoreThan(asked) },
        })
      ) {
        throw new BadRequestException(
          'Ya hay una liquidación de un mes posterior: los meses se liquidan en orden',
        );
      }
      const totals = await this.monthOf(store, asked, m);
      const row = await settlements.save(
        settlements.create({
          storeId: id,
          month: asked,
          collected: totals.collected,
          commission: totals.commission,
          toKenova: totals.toKenova,
          carriedIn: totals.carriedIn,
          due: totals.due,
          received: dto.received.toFixed(2),
          receivedOn: dto.receivedOn,
          method: dto.method,
          note: dto.note ?? null,
          createdById: actorId,
        }),
      );
      await this.audit.record(
        {
          action: 'COMMISSION_SETTLED',
          actorUserId: actorId,
          entityType: 'store',
          entityId: id,
          metadata: { month: asked, due: row.due, received: row.received },
        },
        m,
      );
      return row;
    });
    const view = await this.stores.manager
      .getRepository(CommissionSettlement)
      .findOneOrFail({
        where: { id: saved.id },
        relations: { createdBy: true },
      });
    return StoresService.settlementView(view);
  }

  /** Undoes the store's latest settlement, to correct a mistake. */
  async undoSettlement(
    id: string,
    month: string,
    actorId: string,
  ): Promise<void> {
    const asked = StoresService.checkMonth(month);
    await this.stores.manager.transaction(async (m) => {
      await m.getRepository(Store).findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      const settlements = m.getRepository(CommissionSettlement);
      const row = await settlements.findOne({
        where: { storeId: id, month: asked },
      });
      if (!row) throw new NotFoundException('Este mes no está liquidado');
      if (
        await settlements.exists({
          where: { storeId: id, month: MoreThan(asked) },
        })
      ) {
        throw new BadRequestException(
          'Solo se puede deshacer la última liquidación',
        );
      }
      await settlements.delete(row.id);
      await this.audit.record(
        {
          action: 'COMMISSION_SETTLEMENT_UNDONE',
          actorUserId: actorId,
          entityType: 'store',
          entityId: id,
          metadata: { month: asked, due: row.due, received: row.received },
        },
        m,
      );
    });
  }

  private static checkMonth(month: string): string {
    if (!MONTH.test(month)) {
      throw new BadRequestException('El mes debe tener la forma AAAA-MM');
    }
    return month;
  }

  private static settlementView(s: CommissionSettlement): SettlementView {
    return {
      id: s.id,
      month: s.month,
      collected: s.collected,
      commission: s.commission,
      toKenova: s.toKenova,
      carriedIn: s.carriedIn,
      due: s.due,
      received: s.received,
      pending: euros(cents(s.due) - cents(s.received)),
      receivedOn: s.receivedOn,
      method: s.method,
      note: s.note,
      createdBy: s.createdBy
        ? { id: s.createdBy.id, fullName: s.createdBy.fullName }
        : null,
      createdAt: s.createdAt,
    };
  }

  private async checkPrefixFree(prefix: string): Promise<void> {
    if (await this.stores.exist({ where: { prefix } })) {
      throw new ConflictException(
        `El prefijo ${prefix} ya lo usa otra tienda. Elige otro.`,
      );
    }
  }

  async create(dto: CreateStoreDto, actorId: string): Promise<Store> {
    await this.checkPrefixFree(dto.prefix);
    StoresService.checkCashHours(
      dto.cashOpensAt ?? '09:00:00',
      dto.cashClosesAt ?? '20:00:00',
    );
    const commission = StoresService.nextCommission(dto, false);
    const saved = await this.stores.save(
      this.stores.create({
        ...dto,
        cashFloat: dto.cashFloat?.toFixed(2),
        commissionType: commission?.type ?? null,
        commissionValue: commission?.value ?? null,
        isMain: false,
        isActive: true,
      }),
    );
    if (commission?.type) {
      await this.commissionChanges.save(
        this.commissionChanges.create({
          storeId: saved.id,
          ...commission,
          changedById: actorId,
        }),
      );
    }
    await this.audit.record({
      action: 'STORE_CREATED',
      actorUserId: actorId,
      entityType: 'store',
      entityId: saved.id,
      metadata: { prefix: saved.prefix },
    });
    return saved;
  }

  async update(
    id: string,
    dto: UpdateStoreDto,
    actorId: string,
  ): Promise<Store> {
    const store = await this.stores.findOne({ where: { id } });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    if (dto.isActive === false && store.isMain) {
      throw new BadRequestException(
        'La tienda principal no se puede desactivar',
      );
    }
    if (dto.prefix !== undefined && dto.prefix !== store.prefix) {
      const orders = store.nextOrderNumber - 1;
      if (orders > 0) {
        throw new BadRequestException(
          `El prefijo no se puede cambiar: ya hay ${orders} órdenes con ${store.prefix}-`,
        );
      }
      await this.checkPrefixFree(dto.prefix);
    }
    StoresService.checkCashHours(
      dto.cashOpensAt ?? store.cashOpensAt,
      dto.cashClosesAt ?? store.cashClosesAt,
    );
    const commission = StoresService.nextCommission(dto, store.isMain);
    const commissionChanged =
      commission !== undefined &&
      (commission.type !== store.commissionType ||
        commission.value !== store.commissionValue);
    const deactivating = dto.isActive === false && store.isActive;
    Object.assign(store, {
      ...dto,
      cashFloat: dto.cashFloat?.toFixed(2) ?? store.cashFloat,
      commissionType: commission ? commission.type : store.commissionType,
      commissionValue: commission ? commission.value : store.commissionValue,
    });
    const saved = await this.stores.save(store);
    if (commissionChanged) {
      await this.commissionChanges.save(
        this.commissionChanges.create({
          storeId: id,
          ...commission,
          changedById: actorId,
        }),
      );
    }

    if (deactivating) {
      const members = await this.users.find({
        where: { storeId: id },
        select: { id: true },
      });
      for (const m of members) await this.auth.revokeAllSessions(m.id);
    }
    await this.audit.record({
      action: deactivating ? 'STORE_DEACTIVATED' : 'STORE_UPDATED',
      actorUserId: actorId,
      entityType: 'store',
      entityId: id,
      metadata: { fields: Object.keys(dto) },
    });
    return saved;
  }
}
