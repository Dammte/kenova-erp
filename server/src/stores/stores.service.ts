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
import { Store } from './entities/store.entity';

@Injectable()
export class StoresService {
  constructor(
    @InjectRepository(Store) private readonly stores: Repository<Store>,
    @InjectRepository(User) private readonly users: Repository<User>,
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
    const saved = await this.stores.save(
      this.stores.create({
        ...dto,
        cashFloat: dto.cashFloat?.toFixed(2),
        isMain: false,
        isActive: true,
      }),
    );
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
    const deactivating = dto.isActive === false && store.isActive;
    Object.assign(store, {
      ...dto,
      cashFloat: dto.cashFloat?.toFixed(2) ?? store.cashFloat,
    });
    const saved = await this.stores.save(store);

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
