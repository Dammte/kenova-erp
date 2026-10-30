// src/sticky-notes/sticky-notes.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthUser } from '../auth/auth.types';
import { assertOrderVisible } from '../common/store-scope';
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
    actor: AuthUser,
  ): Promise<StickyNote> {
    await assertOrderVisible(
      this.serviceOrderRepository.manager,
      orderId,
      actor,
    );

    const stickyNote = this.stickyNotesRepository.create({
      ...createStickyNoteDto,
      orderService: { id: orderId } as ServiceOrder,
    });

    return this.stickyNotesRepository.save(stickyNote);
  }

  async findAllByOrder(
    orderId: string,
    actor: AuthUser,
  ): Promise<StickyNote[]> {
    await assertOrderVisible(
      this.serviceOrderRepository.manager,
      orderId,
      actor,
    );
    return this.stickyNotesRepository.find({
      where: { orderService: { id: orderId } },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(
    orderId: string,
    id: number,
    actor: AuthUser,
  ): Promise<StickyNote> {
    await assertOrderVisible(
      this.serviceOrderRepository.manager,
      orderId,
      actor,
    );
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
    actor: AuthUser,
  ): Promise<StickyNote> {
    const stickyNote = await this.findOne(orderId, id, actor);
    Object.assign(stickyNote, updateStickyNoteDto);
    return this.stickyNotesRepository.save(stickyNote);
  }

  async remove(orderId: string, id: number, actor: AuthUser): Promise<void> {
    const stickyNote = await this.findOne(orderId, id, actor);
    await this.stickyNotesRepository.remove(stickyNote);
  }
}
