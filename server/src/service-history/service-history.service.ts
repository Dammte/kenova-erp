import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
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
    actorUserId: string,
  ): Promise<ServiceHistory> {
    const { serviceOrderId, deviceId, ...rest } = dto;

    const serviceOrder = await this.serviceOrderRepository.findOne({
      where: { id: serviceOrderId, deletedAt: IsNull() },
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
        performedBy: { id: actorUserId } as any,
      }),
    );
    return this.findOne(saved.id);
  }

  async findByServiceOrderId(
    serviceOrderId: string,
  ): Promise<ServiceHistory[]> {
    const rows = await this.serviceHistoryRepository.find({
      where: { serviceOrderId },
      relations: { performedBy: true },
      order: { performedAt: 'ASC' },
    });
    return rows.map(slimAuthor);
  }

  async findOne(id: string): Promise<ServiceHistory> {
    const serviceHistory = await this.serviceHistoryRepository.findOne({
      where: { id },
      relations: { performedBy: true },
    });
    if (!serviceHistory) {
      throw new NotFoundException('Entrada de historial no encontrada');
    }
    return slimAuthor(serviceHistory);
  }
}
