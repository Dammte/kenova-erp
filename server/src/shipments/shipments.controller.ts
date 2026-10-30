import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { ShipmentStatus } from './entities/shipment.entity';
import { ShipmentsService } from './shipments.service';

@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('status', new ParseEnumPipe(ShipmentStatus, { optional: true }))
    status?: ShipmentStatus,
  ) {
    return this.shipments.list(user, page, status);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.shipments.findOne(id, user);
  }

  @Post()
  create(@Body() dto: CreateShipmentDto, @CurrentUser() user: AuthUser) {
    return this.shipments.create(dto, user);
  }
}
