import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/entities/user.entity';
import {
  ListSupplierOrdersDto,
  SupplierOrderStateDto,
} from '../dto/supplier-order.dto';
import { SupplierOrdersService } from './supplier-orders.service';

/** The log of orders bought on suppliers' websites; the administrator's, like the suppliers. */
@Roles(UserRole.SUPER_ADMIN)
@Controller()
export class SupplierOrdersController {
  constructor(private readonly orders: SupplierOrdersService) {}

  /** «Sincronizar ahora»: reads the supplier's website and adds the new orders. */
  @Post('suppliers/:id/sync')
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  sync(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.orders.sync(id, user.id);
  }

  @Get('supplier-orders')
  list(@Query() dto: ListSupplierOrdersDto) {
    return this.orders.list(dto);
  }

  @Get('supplier-orders/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.findOne(id);
  }

  @Patch('supplier-orders/:id')
  setState(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SupplierOrderStateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.setState(id, dto.state, user.id);
  }

  /** Reads the order's page on the supplier's website again. */
  @Post('supplier-orders/:id/lines')
  @HttpCode(200)
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  refreshLines(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.refreshLines(id);
  }
}
