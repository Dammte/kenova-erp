import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Client } from '../clients/entities/client.entity';
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

  async create(dto: CreateDeviceDto, actorUserId: string): Promise<Device> {
    const { code, pattern, ...data } = dto;
    const secret = DeviceSecretService.pick({ code, pattern });

    const id = await this.dataSource.transaction(async (manager) => {
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
      return saved.id;
    });
    return this.findOne(id);
  }

  findAll(): Promise<Device[]> {
    return this.deviceRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Device> {
    const device = await this.deviceRepository.findOne({ where: { id } });
    if (!device) throw new NotFoundException('Dispositivo no encontrado');
    return device;
  }

  findByClientId(clientId: string): Promise<Device[]> {
    return this.deviceRepository.find({
      where: { clientId },
      order: { createdAt: 'DESC' },
    });
  }

  async update(
    id: string,
    dto: UpdateDeviceDto,
    actorUserId: string,
  ): Promise<Device> {
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
