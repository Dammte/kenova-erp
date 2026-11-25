import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Supplier } from './entities/supplier.entity';
import {
  SupplierOrder,
  SupplierOrderLine,
} from './entities/supplier-order.entity';
import { SupplierOrdersController } from './orders/supplier-orders.controller';
import { SupplierOrdersService } from './orders/supplier-orders.service';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';
import { SupplierWebService } from './web/supplier-web.service';

/** The companies Kenova buys parts from, and the orders read from their websites. */
@Module({
  imports: [
    TypeOrmModule.forFeature([Supplier, SupplierOrder, SupplierOrderLine]),
  ],
  controllers: [SuppliersController, SupplierOrdersController],
  providers: [SuppliersService, SupplierWebService, SupplierOrdersService],
  exports: [SuppliersService, SupplierWebService, SupplierOrdersService],
})
export class SuppliersModule {}
