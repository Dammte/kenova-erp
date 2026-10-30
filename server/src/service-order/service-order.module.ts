import { Module } from '@nestjs/common';
import { ServiceOrderService } from './service-order.service';
import { IntakeService } from './intake.service';
import { ClientsModule } from '../clients/clients.module';
import { DevicesModule } from '../devices/devices.module';
import { ServiceOrderController } from './service-order.controller';
import { ServiceOrder } from './entities/service-order.entity';
import { OrderLine } from './entities/order-line.entity';
import { Client } from '../clients/entities/client.entity';
import { Device } from '../devices/entities/device.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Service } from '../services/entities/service.entity';
import { Brand } from '../brands/entities/brand.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import { ServiceHistory } from '../service-history/entities/service-history.entity';

@Module({
  controllers: [ServiceOrderController],
  providers: [ServiceOrderService, IntakeService],
  imports: [
    ClientsModule,
    DevicesModule,
    TypeOrmModule.forFeature([
      ServiceOrder,
      OrderLine,
      Client,
      Device,
      Service,
      Brand,
      Inventory,
      ServiceHistory,
    ]),
  ],
})
export class ServiceOrderModule {}
