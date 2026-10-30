import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../auth/auth.types';
import { ClientsService } from '../clients/clients.service';
import { DevicesService } from '../devices/devices.service';
import { CreateIntakeDto } from './dto/create-intake.dto';
import { ServiceOrder } from './entities/service-order.entity';
import { ServiceOrderService } from './service-order.service';

/**
 * Creates client (if new), device (if new) and order atomically for the
 * one-screen intake. Reuses the regular create logic of each service, so
 * validation, name normalization and PIN encryption are the same as in the
 * step-by-step wizard, which keeps working unchanged.
 */
@Injectable()
export class IntakeService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly clients: ClientsService,
    private readonly devices: DevicesService,
    private readonly orders: ServiceOrderService,
  ) {}

  async create(dto: CreateIntakeDto, actor: AuthUser): Promise<ServiceOrder> {
    const actorUserId = actor.id;
    const orderId = await this.dataSource.transaction(async (manager) => {
      const clientId =
        dto.clientId ??
        (await this.clients.create(dto.client!, actor, manager)).id;
      const deviceId =
        dto.deviceId ??
        (
          await this.devices.create(
            { ...dto.device!, clientId },
            actorUserId,
            manager,
          )
        ).id;
      const order = await this.orders.create(
        { ...dto.order, clientId, deviceId },
        await this.orders.storeIdFor(actor, manager),
        manager,
      );
      return order.id;
    });
    return this.orders.findOne(orderId);
  }
}
