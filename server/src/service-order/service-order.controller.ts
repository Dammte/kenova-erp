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
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { ServiceOrderService } from './service-order.service';
import { CreateServiceOrderDto } from './dto/create-service-order.dto';
import { UpdateServiceOrderDto } from './dto/update-service-order.dto';
import { ConsumePartsDto } from './dto/consume-parts.dto';
import { CreateIntakeDto } from './dto/create-intake.dto';
import { IntakeService } from './intake.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { OrderPaymentsService } from './order-payments.service';

@Controller('service-orders')
export class ServiceOrderController {
  constructor(
    private readonly serviceOrderService: ServiceOrderService,
    private readonly intakeService: IntakeService,
    private readonly paymentsService: OrderPaymentsService,
  ) {}

  @Post()
  async create(
    @Body() dto: CreateServiceOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.serviceOrderService.create(dto, {
      storeId: await this.serviceOrderService.storeIdFor(user),
      actor: user,
    });
  }

  /** One-screen intake: client + device + order in a single transaction. */
  @Post('intake')
  intake(@Body() dto: CreateIntakeDto, @CurrentUser() user: AuthUser) {
    return this.intakeService.create(dto, user);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.serviceOrderService.findAll(user);
  }

  @Get('client/:clientId')
  findByClient(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.serviceOrderService.findByClientId(clientId, user);
  }

  /** Open orders and past deliveries of an IMEI, for the intake warnings. */
  @Get('by-imei')
  lookupImei(@Query('imei') imei = '', @CurrentUser() user: AuthUser) {
    return this.serviceOrderService.lookupImei(imei, user);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.serviceOrderService.findOne(id, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.serviceOrderService.update(id, dto, user);
  }

  /** Charges and refunds of the order, oldest first. */
  @Get(':id/payments')
  listPayments(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.paymentsService.list(id, user);
  }

  /** Registers a charge or a refund; repeating the same `id` never charges twice. */
  @Post(':id/payments')
  async addPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.paymentsService.record(
      id,
      dto,
      user,
      await this.serviceOrderService.storeIdFor(user),
    );
  }

  /** Atomically takes the given parts out of stock and records them on the order. */
  @Post(':id/consume-parts')
  @HttpCode(200)
  consumeParts(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConsumePartsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.serviceOrderService.consumeParts(id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(204)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.serviceOrderService.remove(id, user.id);
  }
}
