import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import {
  SupplierConnectionDto,
  SupplierCredentialsDto,
} from './dto/connection.dto';
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

  @Put(':id/connection')
  saveConnection(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SupplierConnectionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.suppliers.saveConnection(id, dto, user.id);
  }

  /** Write-only: the answer says that there is a login, never what it is. */
  @Put(':id/credentials')
  setCredentials(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SupplierCredentialsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.suppliers.setCredentials(id, dto, user.id);
  }

  @Delete(':id/credentials')
  clearCredentials(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.suppliers.clearCredentials(id, user.id);
  }
}
