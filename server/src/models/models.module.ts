import { Module } from '@nestjs/common';
import { ModelsService } from './models.service';
import { ModelsController } from './models.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Model } from './entities/model.entity';
import { Device } from '../devices/entities/device.entity';
import { Service } from '../services/entities/service.entity';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  controllers: [ModelsController, CatalogController],
  providers: [ModelsService, CatalogService],
  imports: [TypeOrmModule.forFeature([Model, Device, Service])],
})
export class ModelsModule {}
