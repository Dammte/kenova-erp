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

/** Only the author's id and name leave the server, never the rest of the user. */
function withAuthor(note: StickyNote): StickyNote {
  if (note.createdBy) {
    const { id, fullName } = note.createdBy;
    note.createdBy = { id, fullName } as StickyNote['createdBy'];
  }
  return note;
}

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
      createdById: actor.id,
    });

    const saved = await this.stickyNotesRepository.save(stickyNote);
    return withAuthor(
      await this.stickyNotesRepository.findOneOrFail({
        where: { id: saved.id },
        relations: { createdBy: true },
      }),
    );
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
    const notes = await this.stickyNotesRepository.find({
      where: { orderService: { id: orderId } },
      relations: { createdBy: true },
      order: { createdAt: 'DESC' },
    });
    return notes.map(withAuthor);
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
