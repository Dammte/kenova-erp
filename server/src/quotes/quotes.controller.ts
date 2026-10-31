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
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateQuoteDto, UpdateQuoteDto } from './dto/create-quote.dto';
import { ListQuotesDto } from './dto/list-quotes.dto';
import { QuotesService } from './quotes.service';

/** Design 2.4. Each store sees and makes its own quotes; the partners see all. */
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Post()
  create(@Body() dto: CreateQuoteDto, @CurrentUser() user: AuthUser) {
    return this.quotes.create(dto, user);
  }

  @Get()
  list(@Query() query: ListQuotesDto, @CurrentUser() user: AuthUser) {
    return this.quotes.list(query, user);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quotes.findOne(id, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quotes.update(id, dto, user);
  }

  @Post(':id/send')
  @HttpCode(200)
  send(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.quotes.send(id, user);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quotes.reject(id, user);
  }

  @Post(':id/renew')
  @HttpCode(200)
  renew(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.quotes.renew(id, user);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quotes.remove(id, user);
  }
}
