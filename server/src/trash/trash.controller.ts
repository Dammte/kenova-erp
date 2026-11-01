import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth.types';
import { UserRole } from '../users/entities/user.entity';
import { TRASH_KINDS, TrashService, type TrashKind } from './trash.service';

/** Design R2 3.10 «Papelera»: partners only. */
@Controller('trash')
@Roles(UserRole.SUPER_ADMIN)
export class TrashController {
  constructor(private readonly trash: TrashService) {}

  /** ?kind=order|client|part, ?q= text, ?page=; newest deleted first. */
  @Get()
  list(
    @Query('kind') kind?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
  ) {
    const n = Number(page);
    return this.trash.list(
      (TRASH_KINDS as readonly string[]).includes(kind ?? '')
        ? (kind as TrashKind)
        : undefined,
      q,
      Number.isInteger(n) && n > 1 ? n : 1,
    );
  }

  @Post(':kind/:id/restore')
  @HttpCode(204)
  restore(
    @Param('kind') kind: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.trash.restore(kind, id, actor.id);
  }
}
