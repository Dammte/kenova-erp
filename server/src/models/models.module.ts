import { Module } from '@nestjs/common';
import { ModelsService } from './models.service';
import { ModelsController } from './models.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Model } from './entities/model.entity';

@Module({
  controllers: [ModelsController],
  providers: [ModelsService],
  imports: [TypeOrmModule.forFeature([Model])],
})
export class ModelsModule {}
