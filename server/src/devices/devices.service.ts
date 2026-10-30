import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type { AuthUser } from '../auth/auth.types';
import { Client } from '../clients/entities/client.entity';
import {
  assertClientVisible,
  assertDeviceVisible,
  clientVisibleSql,
  scopedStoreId,
} from '../common/store-scope';
import { Device } from './entities/device.entity';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { DeviceSecretService } from './device-secret.service';

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly secrets: DeviceSecretService,
  ) {}

  /**
   * With `outer`, runs inside the caller's transaction (the intake) and returns
   * the saved, not yet committed row; otherwise opens its own transaction.
   */
  async create(
    dto: CreateDeviceDto,
    actorUserId: string,
    outer?: EntityManager,
  ): Promise<Device> {
    const { code, pattern, ...data } = dto;
    const secret = DeviceSecretService.pick({ code, pattern });

    const insert = async (manager: EntityManager) => {
      const client = await manager
        .getRepository(Client)
        .findOne({ where: { id: dto.clientId } });
      if (!client) throw new NotFoundException('Cliente no encontrado');

      const repo = manager.getRepository(Device);
      const saved = await repo.save(
        repo.create({
          ...data,
          imei: data.imei || null,
          inventoryCode: data.inventoryCode || null,
        } as Partial<Device>),
      );
      if (secret)
        await this.secrets.set(saved.id, secret, actorUserId, manager);
      return saved;
    };
    if (outer) return insert(outer);
    const saved = await this.dataSource.transaction(insert);
    return this.findOne(saved.id);
  }

  /** Registers a device for a client the actor sees (the API, not the intake). */
  async createFor(dto: CreateDeviceDto, actor: AuthUser): Promise<Device> {
    await assertClientVisible(this.dataSource.manager, dto.clientId, actor);
    return this.create(dto, actor.id);
  }

  /** A store sees the devices of the clients it sees. */
  assertVisible(id: string, actor: AuthUser): Promise<void> {
    return assertDeviceVisible(this.dataSource.manager, id, actor);
  }

  findAll(actor: AuthUser): Promise<Device[]> {
    const storeId = scopedStoreId(actor);
    if (!storeId) {
      return this.deviceRepository.find({ order: { createdAt: 'DESC' } });
    }
    return this.deviceRepository
      .createQueryBuilder('d')
      .innerJoin('d.client', 'c')
      .where(clientVisibleSql('c'), { scopeStoreId: storeId })
      .orderBy('d.createdAt', 'DESC')
      .getMany();
  }

  /** Without an actor (internal calls) the device is not limited to a store. */
  async findOne(id: string, actor?: AuthUser): Promise<Device> {
    if (actor) await this.assertVisible(id, actor);
    const device = await this.deviceRepository.findOne({ where: { id } });
    if (!device) throw new NotFoundException('Dispositivo no encontrado');
    return device;
  }

  async findByClientId(clientId: string, actor: AuthUser): Promise<Device[]> {
    await assertClientVisible(this.dataSource.manager, clientId, actor);
    return this.deviceRepository.find({
      where: { clientId },
      order: { createdAt: 'DESC' },
    });
  }

  async update(
    id: string,
    dto: UpdateDeviceDto,
    actor: AuthUser,
  ): Promise<Device> {
    await this.assertVisible(id, actor);
    const actorUserId = actor.id;
    const { code, pattern, ...data } = dto;
    const secret = DeviceSecretService.pick({ code, pattern });

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Device);
      const device = await repo.findOne({ where: { id } });
      if (!device) throw new NotFoundException('Dispositivo no encontrado');
      const changes: Partial<Device> = { ...data } as Partial<Device>;
      if ('imei' in data) changes.imei = data.imei || undefined;
      if ('inventoryCode' in data)
        changes.inventoryCode = data.inventoryCode || (null as any);
      if (Object.keys(changes).length > 0) await repo.update(id, changes);
      if (secret) await this.secrets.set(id, secret, actorUserId, manager);
    });
    return this.findOne(id);
  }
}
