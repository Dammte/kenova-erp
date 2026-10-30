// src/sticky-notes/sticky-notes.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  NotFoundException,
  ParseIntPipe,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StickyNotesService } from './sticky-notes.service';
import { CreateStickyNoteDto } from './dto/create-sticky-note.dto';
import { UpdateStickyNoteDto } from './dto/update-sticky-note.dto';

@Controller('service-orders/:orderId/sticky-notes') // Cambié 'order-services' a 'service-orders' para consistencia con el nombre de la entidad ServiceOrder
export class StickyNotesController {
  constructor(private readonly stickyNotesService: StickyNotesService) {}

  @Post()
  create(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() createStickyNoteDto: CreateStickyNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.stickyNotesService.create(orderId, createStickyNoteDto, user);
  }

  @Get()
  findAll(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.stickyNotesService.findAllByOrder(orderId, user);
  }

  @Get(':id')
  async findOne(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const stickyNote = await this.stickyNotesService.findOne(orderId, id, user);
    if (!stickyNote) {
      throw new NotFoundException(
        `StickyNote with ID ${id} not found in order ${orderId}`,
      );
    }
    return stickyNote;
  }

  @Put(':id')
  update(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateStickyNoteDto: UpdateStickyNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.stickyNotesService.update(
      orderId,
      id,
      updateStickyNoteDto,
      user,
    );
  }

  @Delete(':id')
  remove(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.stickyNotesService.remove(orderId, id, user);
  }
}
