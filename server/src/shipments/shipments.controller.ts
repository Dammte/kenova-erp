import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
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
import { ScanDto } from './dto/scan.dto';
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

  /** One reading of the scanner while receiving the shipment. */
  @Post(':id/scan')
  @HttpCode(200)
  scan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScanDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.shipments.scan(id, dto.code, user);
  }

  /** Ends the reception; what was not scanned is marked as not arrived. */
  @Post(':id/close')
  @HttpCode(200)
  close(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.shipments.close(id, user);
  }

  @Post()
  create(@Body() dto: CreateShipmentDto, @CurrentUser() user: AuthUser) {
    return this.shipments.create(dto, user);
  }
}
