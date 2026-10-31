import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsOptional, IsUUID, Matches } from 'class-validator';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CashService } from './cash.service';
import { CreateCashMovementDto } from './dto/create-cash-movement.dto';

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

  /** Cash put into or taken out of the till by hand. */
  @Post('movements')
  addMovement(
    @Body() dto: CreateCashMovementDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.cash.addMovement(user, dto);
  }
}
