import { Module } from '@nestjs/common';
import { StickyNotesService } from './sticky-notes.service';
import { StickyNotesController } from './sticky-notes.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StickyNote } from './entities/sticky-note.entity';
import { ServiceOrder } from '../service-order/entities/service-order.entity';

@Module({
  imports: [TypeOrmModule.forFeature([StickyNote, ServiceOrder])],
  controllers: [StickyNotesController],
  providers: [StickyNotesService],
})
export class StickyNotesModule {}
