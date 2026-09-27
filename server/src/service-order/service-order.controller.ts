import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { ServiceOrderService } from './service-order.service';
import { CreateServiceOrderDto } from './dto/create-service-order.dto';
import { UpdateServiceOrderDto } from './dto/update-service-order.dto';
import { ConsumePartsDto } from './dto/consume-parts.dto';

@Controller('service-orders')
export class ServiceOrderController {
  constructor(private readonly serviceOrderService: ServiceOrderService) {}

  @Post()
  create(@Body() dto: CreateServiceOrderDto) {
    return this.serviceOrderService.create(dto);
  }

  @Get()
  findAll() {
    return this.serviceOrderService.findAll();
  }

  @Get('client/:clientId')
  findByClient(@Param('clientId', ParseUUIDPipe) clientId: string) {
    return this.serviceOrderService.findByClientId(clientId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.serviceOrderService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.serviceOrderService.update(id, dto, user.id);
  }

  /** Atomically takes the given parts out of stock and records them on the order. */
  @Post(':id/consume-parts')
  @HttpCode(200)
  consumeParts(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConsumePartsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.serviceOrderService.consumeParts(id, dto, user.id);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(204)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.serviceOrderService.remove(id, user.id);
  }
}
