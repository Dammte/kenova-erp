import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedRequest, AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DevicesService } from './devices.service';
import { DeviceSecretService } from './device-secret.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';

@Controller('devices')
export class DevicesController {
  constructor(
    private readonly devicesService: DevicesService,
    private readonly secrets: DeviceSecretService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.devicesService.findAll(user);
  }

  @Get('client/:clientId')
  findByClientId(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.devicesService.findByClientId(clientId, user);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.devicesService.findOne(id, user);
  }

  @Post()
  create(@Body() dto: CreateDeviceDto, @CurrentUser() user: AuthUser) {
    return this.devicesService.createFor(dto, user);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeviceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.devicesService.update(id, dto, user);
  }

  /** Returns the decrypted unlock code/pattern. Every call is audited. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':id/unlock-secret/reveal')
  @HttpCode(200)
  async reveal(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.devicesService.assertVisible(id, req.user!);
    return this.secrets.reveal(id, req.user!.id, req.ip ?? null);
  }

  @Delete(':id/unlock-secret')
  @HttpCode(204)
  async clearSecret(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.devicesService.assertVisible(id, user);
    return this.secrets.clear(id, user.id);
  }
}
