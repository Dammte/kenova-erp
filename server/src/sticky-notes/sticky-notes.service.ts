// src/sticky-notes/sticky-notes.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StickyNote } from './entities/sticky-note.entity';
import { ServiceOrder } from '../service-order/entities/service-order.entity';
import { CreateStickyNoteDto } from './dto/create-sticky-note.dto';
import { UpdateStickyNoteDto } from './dto/update-sticky-note.dto';

@Injectable()
export class StickyNotesService {
  constructor(
    @InjectRepository(StickyNote)
    private stickyNotesRepository: Repository<StickyNote>,
    @InjectRepository(ServiceOrder)
    private serviceOrderRepository: Repository<ServiceOrder>,
  ) {}

  async create(
    orderId: string,
    createStickyNoteDto: CreateStickyNoteDto,
  ): Promise<StickyNote> {
    const order = await this.serviceOrderRepository.findOneBy({ id: orderId });
    if (!order) {
      throw new NotFoundException(`ServiceOrder with ID ${orderId} not found`);
    }

    const stickyNote = this.stickyNotesRepository.create({
      ...createStickyNoteDto,
      orderService: order,
    });

    return this.stickyNotesRepository.save(stickyNote);
  }

  async findAllByOrder(orderId: string): Promise<StickyNote[]> {
    return this.stickyNotesRepository.find({
      where: { orderService: { id: orderId } },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(orderId: string, id: number): Promise<StickyNote> {
    const stickyNote = await this.stickyNotesRepository.findOne({
      where: { id, orderService: { id: orderId } },
    });
    if (!stickyNote) {
      throw new NotFoundException(
        `StickyNote with ID ${id} not found in order ${orderId}`,
      );
    }
    return stickyNote;
  }

  async update(
    orderId: string,
    id: number,
    updateStickyNoteDto: UpdateStickyNoteDto,
  ): Promise<StickyNote> {
    const stickyNote = await this.findOne(orderId, id);
    Object.assign(stickyNote, updateStickyNoteDto);
    return this.stickyNotesRepository.save(stickyNote);
  }

  async remove(orderId: string, id: number): Promise<void> {
    const stickyNote = await this.findOne(orderId, id);
    await this.stickyNotesRepository.remove(stickyNote);
  }
}
