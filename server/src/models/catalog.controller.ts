import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth.types';
import { UserRole } from '../users/entities/user.entity';
import { CatalogService } from './catalog.service';
import { MergeModelsDto, UpdateCatalogModelDto } from './dto/catalog.dto';

/** Design R2 3.8 «Catálogo»: brands and models, for the partners. */
@Controller('catalog/models')
@Roles(UserRole.SUPER_ADMIN)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list() {
    return this.catalog.list();
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogModelDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.catalog.update(id, dto, actor.id);
  }

  @Post(':id/merge')
  merge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MergeModelsDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.catalog.merge(id, dto, actor.id);
  }
}
