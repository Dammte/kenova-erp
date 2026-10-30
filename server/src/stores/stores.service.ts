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

  async create(dto: CreateStoreDto, actorId: string): Promise<Store> {
    if (await this.stores.exist({ where: { prefix: dto.prefix } })) {
      throw new ConflictException(
        `El prefijo ${dto.prefix} ya lo usa otra tienda. Elige otro.`,
      );
    }
    const saved = await this.stores.save(
      this.stores.create({ ...dto, isMain: false, isActive: true }),
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
    const deactivating = dto.isActive === false && store.isActive;
    Object.assign(store, dto);
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
