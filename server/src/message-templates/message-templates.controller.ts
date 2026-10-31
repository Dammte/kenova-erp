import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { SaveTemplateDto, TemplateStoreDto } from './dto/template.dto';
import { MessageTemplatesService } from './message-templates.service';

/** Design 2.5. Each store edits its own notices; the partners, any store's. */
@Controller('message-templates')
export class MessageTemplatesController {
  constructor(private readonly templates: MessageTemplatesService) {}

  @Get()
  list(@Query() query: TemplateStoreDto, @CurrentUser() user: AuthUser) {
    return this.templates.list(user, query.storeId);
  }

  @Put(':trigger')
  save(
    @Param('trigger') trigger: string,
    @Body() dto: SaveTemplateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.templates.save(trigger, dto.body, user, dto.storeId);
  }

  @Delete(':trigger')
  restore(
    @Param('trigger') trigger: string,
    @Query() query: TemplateStoreDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.templates.restore(trigger, user, query.storeId);
  }

  @Post(':trigger/copy-to-all')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN)
  copyToAll(
    @Param('trigger') trigger: string,
    @Body() dto: TemplateStoreDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.templates.copyToAll(trigger, user, dto.storeId);
  }
}
