import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ServiceHistoryService } from './service-history.service';
import { CreateServiceHistoryDto } from './dto/create-service-history.dto';

/**
 * History is append-only: entries can be added and read, never edited or
 * deleted, so it can be trusted as a record of what happened.
 */
@Controller('service-history')
export class ServiceHistoryController {
  constructor(private readonly serviceHistoryService: ServiceHistoryService) {}

  @Post()
  create(@Body() dto: CreateServiceHistoryDto, @CurrentUser() user: AuthUser) {
    return this.serviceHistoryService.create(dto, user.id);
  }

  @Get('order/:serviceOrderId')
  findByOrder(@Param('serviceOrderId', ParseUUIDPipe) serviceOrderId: string) {
    return this.serviceHistoryService.findByServiceOrderId(serviceOrderId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.serviceHistoryService.findOne(id);
  }
}
