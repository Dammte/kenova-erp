import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { AuthUser } from '../auth/auth.types';
import { assertOrderVisible, orderScope } from '../common/store-scope';
import { ServiceHistory } from './entities/service-history.entity';
import { CreateServiceHistoryDto } from './dto/create-service-history.dto';
import { ServiceOrder } from '../service-order/entities/service-order.entity';
import { Device } from '../devices/entities/device.entity';

/** Only the fields of the author that the UI needs. */
function slimAuthor(entry: ServiceHistory): ServiceHistory {
  if (entry.performedBy) {
    const { id, fullName, username } = entry.performedBy;
    entry.performedBy = {
      id,
      fullName,
      username,
    } as ServiceHistory['performedBy'];
  }
  return entry;
}

@Injectable()
export class ServiceHistoryService {
  constructor(
    @InjectRepository(ServiceHistory)
    private readonly serviceHistoryRepository: Repository<ServiceHistory>,
    @InjectRepository(ServiceOrder)
    private readonly serviceOrderRepository: Repository<ServiceOrder>,
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
  ) {}

  async create(
    dto: CreateServiceHistoryDto,
    actor: AuthUser,
  ): Promise<ServiceHistory> {
    const { serviceOrderId, deviceId, ...rest } = dto;

    const serviceOrder = await this.serviceOrderRepository.findOne({
      where: { id: serviceOrderId, deletedAt: IsNull(), ...orderScope(actor) },
    });
    if (!serviceOrder) {
      throw new NotFoundException('Orden de servicio no encontrada');
    }

    if (deviceId) {
      const device = await this.deviceRepository.findOne({
        where: { id: deviceId },
      });
      if (!device) throw new NotFoundException('Dispositivo no encontrado');
    }

    const saved = await this.serviceHistoryRepository.save(
      this.serviceHistoryRepository.create({
        ...rest,
        serviceOrderId: serviceOrder.id,
        deviceId: deviceId ?? serviceOrder.deviceId ?? undefined,
        performedBy: { id: actor.id } as any,
      }),
    );
    return this.findOne(saved.id, actor);
  }

  async findByServiceOrderId(
    serviceOrderId: string,
    actor: AuthUser,
  ): Promise<ServiceHistory[]> {
    await assertOrderVisible(
      this.serviceOrderRepository.manager,
      serviceOrderId,
      actor,
    );
    const rows = await this.serviceHistoryRepository.find({
      where: { serviceOrderId },
      relations: { performedBy: true },
      order: { performedAt: 'ASC' },
    });
    return rows.map(slimAuthor);
  }

  async findOne(id: string, actor: AuthUser): Promise<ServiceHistory> {
    const serviceHistory = await this.serviceHistoryRepository.findOne({
      where: {
        id,
        serviceOrder: { deletedAt: IsNull(), ...orderScope(actor) },
      },
      relations: { performedBy: true },
    });
    if (!serviceHistory) {
      throw new NotFoundException('Entrada de historial no encontrada');
    }
    return slimAuthor(serviceHistory);
  }
}
