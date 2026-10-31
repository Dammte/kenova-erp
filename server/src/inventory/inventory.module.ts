import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryImportService } from './inventory-import.service';
import { InventoryController } from './inventory.controller';
import { InventoryListService } from './inventory-list.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Inventory } from './entities/inventory.entity';
import { StockMovement } from './entities/stock-movement.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Inventory, StockMovement])],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryImportService, InventoryListService],
})
export class InventoryModule {}
