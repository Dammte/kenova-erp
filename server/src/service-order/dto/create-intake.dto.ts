import { OmitType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsOptional,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CreateClientDto } from '../../clients/dto/create-client.dto';
import { CreateDeviceDto } from '../../devices/dto/create-device.dto';
import { CreateServiceOrderDto } from './create-service-order.dto';

export class IntakeDeviceDto extends OmitType(CreateDeviceDto, [
  'clientId',
] as const) {}

export class IntakeOrderDto extends OmitType(CreateServiceOrderDto, [
  'clientId',
  'deviceId',
] as const) {}

/**
 * One-screen intake: an existing client (clientId) or a new one (client), an
 * existing device of that client (deviceId) or a new one (device), and the
 * order. Everything is created in one transaction, so a failure leaves no
 * half-created client or device behind.
 */
export class CreateIntakeDto {
  @IsUUID()
  @IsOptional()
  clientId?: string;

  @ValidateIf((o: CreateIntakeDto) => !o.clientId)
  @IsDefined({ message: 'Indica un cliente existente o los datos del nuevo' })
  @ValidateNested()
  @Type(() => CreateClientDto)
  client?: CreateClientDto;

  @IsUUID()
  @IsOptional()
  deviceId?: string;

  @ValidateIf((o: CreateIntakeDto) => !o.deviceId)
  @IsDefined({
    message: 'Indica un dispositivo existente o los datos del nuevo',
  })
  @ValidateNested()
  @Type(() => IntakeDeviceDto)
  device?: IntakeDeviceDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => IntakeOrderDto)
  order: IntakeOrderDto;

  /** The quote the client accepted; it is marked accepted and linked to the order. */
  @IsUUID()
  @IsOptional()
  quoteId?: string;
}
