import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import { AuthService } from '../auth/auth.service';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { StoreCommissionChange } from './entities/store-commission-change.entity';
import { CommissionType, Store } from './entities/store.entity';

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
