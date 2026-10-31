import { Controller, Get, Query } from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TodayService } from './today.service';

class TodayQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'Tienda no válida' })
  storeId?: string;
}

/** Design 3.1: the Panel «Hoy». */
@Controller('today')
export class TodayController {
  constructor(private readonly today: TodayService) {}

  @Get()
  summary(@Query() query: TodayQueryDto, @CurrentUser() user: AuthUser) {
    return this.today.summary(user, query.storeId);
  }
}
