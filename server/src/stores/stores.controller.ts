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
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth.types';
import { UserRole } from '../users/entities/user.entity';
import { CreateStoreDto } from './dto/create-store.dto';
import { SettleCommissionDto } from './dto/settle-commission.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { StoresService } from './stores.service';

@Controller('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Get()
  findAll(@CurrentUser() actor: AuthUser) {
    return this.storesService.findAll(actor);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.storesService.findOne(id, actor);
  }

  /** Every change of the store's commission, newest first. */
  @Get(':id/commission-history')
  commissionHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.storesService.commissionHistory(id, actor);
  }

  /** The month's delivered orders and commission (?month=AAAA-MM, this month by default). */
  @Get(':id/commissions')
  commissionMonth(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Query('month') month?: string,
  ) {
    return this.storesService.commissionMonth(id, month, actor);
  }

  /** Records what the store handed over for a finished month (partners only). */
  @Post(':id/commissions/:month/settlement')
  @Roles(UserRole.SUPER_ADMIN)
  settleMonth(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('month') month: string,
    @Body() dto: SettleCommissionDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.storesService.settleMonth(id, month, dto, actor.id);
  }

  /** Undoes the store's latest settlement, to correct it. */
  @Delete(':id/commissions/:month/settlement')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(204)
  undoSettlement(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('month') month: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.storesService.undoSettlement(id, month, actor.id);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  create(@Body() dto: CreateStoreDto, @CurrentUser() actor: AuthUser) {
    return this.storesService.create(dto, actor.id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStoreDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.storesService.update(id, dto, actor.id);
  }
}
