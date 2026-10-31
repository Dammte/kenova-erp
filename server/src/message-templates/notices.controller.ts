import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateNoticeDto } from './dto/notice.dto';
import { NoticesService } from './notices.service';

/** The notices sent about one order; WhatsApp itself is opened by the browser. */
@Controller('service-orders/:id/notices')
export class NoticesController {
  constructor(private readonly notices: NoticesService) {}

  @Get()
  list(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.notices.list(id, user);
  }

  @Post()
  record(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateNoticeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notices.record(id, dto, user);
  }
}
