import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceOrderModule } from '../service-order/service-order.module';
import { PartOrder } from './entities/part-order.entity';
import { PartOrdersController } from './part-orders.controller';
import { PartOrdersService } from './part-orders.service';

@Module({
  imports: [TypeOrmModule.forFeature([PartOrder]), ServiceOrderModule],
  controllers: [PartOrdersController],
  providers: [PartOrdersService],
})
export class PartOrdersModule {}
