import { Module } from '@nestjs/common';
import { ServiceHistoryService } from './service-history.service';
import { ServiceHistoryController } from './service-history.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceHistory } from './entities/service-history.entity';
import { ServiceOrder } from '../service-order/entities/service-order.entity';
import { Device } from '../devices/entities/device.entity';
import { User } from '../users/entities/user.entity';

@Module({
  controllers: [ServiceHistoryController],
  providers: [ServiceHistoryService],
  imports: [
    TypeOrmModule.forFeature([ServiceHistory]),
    TypeOrmModule.forFeature([ServiceOrder]),
    TypeOrmModule.forFeature([Device]),
    TypeOrmModule.forFeature([User]),
  ],
})
export class ServiceHistoryModule {}
