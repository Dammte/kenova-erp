import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryImportService } from './inventory-import.service';
import { InventoryController } from './inventory.controller';
import { InventoryListService } from './inventory-list.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Inventory } from './entities/inventory.entity';
import { StockMovement } from './entities/stock-movement.entity';
import { PurchaseInvoicesController } from './invoices/purchase-invoices.controller';
import { PurchaseInvoicesService } from './invoices/purchase-invoices.service';
import { InvoiceReaderService } from './invoices/invoice-reader.service';

@Module({
  imports: [TypeOrmModule.forFeature([Inventory, StockMovement])],
  controllers: [InventoryController, PurchaseInvoicesController],
  providers: [
    InventoryService,
    InventoryImportService,
    PurchaseInvoicesService,
    InvoiceReaderService,
    InventoryListService,
  ],
})
export class InventoryModule {}
