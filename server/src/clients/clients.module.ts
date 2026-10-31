import { Module } from '@nestjs/common';
import { ClientListService } from './client-list.service';
import { ClientMergeService } from './client-merge.service';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from './entities/client.entity';

@Module({
  controllers: [ClientsController],
  providers: [ClientsService, ClientListService, ClientMergeService],
  imports: [TypeOrmModule.forFeature([Client])],
  exports: [ClientsService],
})
export class ClientsModule {}
