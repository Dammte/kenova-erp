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
  Put,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ListClientsDto } from './dto/list-clients.dto';
import { ClientListService } from './client-list.service';
import { ClientMergeService } from './client-merge.service';
import { MergeClientsDto, NotDuplicateDto } from './dto/merge-clients.dto';

@Controller('clients')
export class ClientsController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly clientList: ClientListService,
    private readonly clientMerge: ClientMergeService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.clientsService.findAll(user);
  }

  /** Design 3.3: paginated list with orders, last visit, balance and duplicates. */
  @Get('list')
  list(@Query() query: ListClientsDto, @CurrentUser() user: AuthUser) {
    return this.clientList.list(user, query);
  }

  @Get('search')
  async search(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('dni') dni?: string,
  ) {
    if (typeof dni === 'string' && dni.trim()) {
      const client = await this.clientsService.findByDni(dni, user);
      return client ? [client] : [];
    }
    if (typeof q === 'string') {
      return this.clientsService.searchClients(q, user);
    }
    return [];
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clientsService.findOne(id, user);
  }

  /** Design 3.3: figures, devices and the last orders of the client card. */
  @Get(':id/summary')
  summary(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clientList.summary(id, user);
  }

  /** Clients that look like this one (same phone or document). */
  @Get(':id/duplicates')
  duplicates(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clientMerge.duplicates(id, user);
  }

  /** «No es la misma persona»: the pair is not flagged again. */
  @Post(':id/not-duplicate')
  @HttpCode(204)
  notDuplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NotDuplicateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clientMerge.notDuplicate(id, dto.otherId, user);
  }

  /** Merges another client into this one; partners only (design 3.3). */
  @Post(':id/merge')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(200)
  merge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MergeClientsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clientMerge.merge(id, dto, user);
  }

  /** Saldo a favor per store (only the actor's store for a partner store). */
  @Get(':id/credit')
  credit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clientsService.credit(id, user);
  }

  @Post()
  create(@Body() dto: CreateClientDto, @CurrentUser() user: AuthUser) {
    return this.clientsService.create(dto, user);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clientsService.update(id, dto, user);
  }

  @Patch(':id')
  patch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clientsService.patch(id, dto, user);
  }

  /** Design 3.3: hides the client from lists and searches; nothing is deleted. */
  @Post(':id/archive')
  @HttpCode(200)
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clientsService.setArchived(id, true, user);
  }

  /** Undoes «Archivar». */
  @Post(':id/restore')
  @HttpCode(200)
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clientsService.setArchived(id, false, user);
  }

  /** Removes the client's personal data (RGPD); its orders stay. */
  @Post(':id/anonymize')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(200)
  anonymize(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clientsService.anonymize(id, user);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(204)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clientsService.remove(id, user);
  }
}
