import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';
import { SuppliersService } from './suppliers.service';

/** Buying parts is the administrator's, like the stock (decision 5). */
@Roles(UserRole.SUPER_ADMIN)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  list() {
    return this.suppliers.list();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliers.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateSupplierDto, @CurrentUser() user: AuthUser) {
    return this.suppliers.create(dto, user.id);
  }

  /** Also «Desactivar» / «Reactivar» ({ active }); suppliers are never deleted. */
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.suppliers.update(id, dto, user.id);
  }
}
