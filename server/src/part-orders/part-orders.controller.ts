import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CreatePartOrderDto, ListPartOrdersDto } from './dto/part-order.dto';
import { PartOrdersService } from './part-orders.service';

/** Parts come out of the partners' stock, so ordering them is theirs too (decision 5). */
@Roles(UserRole.SUPER_ADMIN)
@Controller('part-orders')
export class PartOrdersController {
  constructor(private readonly partOrders: PartOrdersService) {}

  @Get()
  list(@Query() query: ListPartOrdersDto) {
    return this.partOrders.list(query);
  }

  @Post()
  create(@Body() dto: CreatePartOrderDto, @CurrentUser() user: AuthUser) {
    return this.partOrders.create(dto, user);
  }

  @Post(':id/receive')
  @HttpCode(200)
  receive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.partOrders.receive(id, user);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.partOrders.remove(id);
  }
}
