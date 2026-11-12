import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { IsOptional, IsUUID, Matches } from 'class-validator';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CashService } from './cash.service';
import { CorrectCashLineDto } from './dto/correct-cash-line.dto';
import { CreateCashMovementDto } from './dto/create-cash-movement.dto';
import { SaveCashCountDto } from './dto/save-cash-count.dto';

class CashDayQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'Tienda no válida' })
  storeId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha no válida' })
  date?: string;
}

/** Design 3.2: the money that came in and went out, per cash day. */
@Controller('cash')
export class CashController {
  constructor(private readonly cash: CashService) {}

  @Get('day')
  day(@Query() query: CashDayQueryDto, @CurrentUser() user: AuthUser) {
    return this.cash.day(user, query.storeId, query.date);
  }

  /** Design 3.2 «Semana»: the week holding `date`, one row per cash day. */
  @Get('week')
  week(@Query() query: CashDayQueryDto, @CurrentUser() user: AuthUser) {
    return this.cash.week(user, query.storeId, query.date);
  }

  /** Cash put into or taken out of the till by hand. */
  @Post('movements')
  addMovement(
    @Body() dto: CreateCashMovementDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.cash.addMovement(user, dto);
  }

  /** Design 3.2 «Corregir un día cerrado»: partners only, with a reason. */
  @Post('corrections')
  @Roles(UserRole.SUPER_ADMIN)
  correct(@Body() dto: CorrectCashLineDto, @CurrentUser() user: AuthUser) {
    return this.cash.correct(user, dto);
  }

  /** The optional count of the cash day running now. */
  @Put('count')
  saveCount(@Body() dto: SaveCashCountDto, @CurrentUser() user: AuthUser) {
    return this.cash.saveCount(user, dto);
  }
}
