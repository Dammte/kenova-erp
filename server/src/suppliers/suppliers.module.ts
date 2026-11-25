import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Supplier } from './entities/supplier.entity';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';
import { SupplierWebService } from './web/supplier-web.service';

/** The companies Kenova buys parts from. */
@Module({
  imports: [TypeOrmModule.forFeature([Supplier])],
  controllers: [SuppliersController],
  providers: [SuppliersService, SupplierWebService],
  exports: [SuppliersService, SupplierWebService],
})
export class SuppliersModule {}
