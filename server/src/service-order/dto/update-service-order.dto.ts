import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { CreateServiceOrderDto } from './create-service-order.dto';

export class UpdateServiceOrderDto extends PartialType(
  OmitType(CreateServiceOrderDto, ['deviceId', 'inventoryIds'] as const),
) {
  /** null detaches the device from the order. */
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  @IsOptional()
  deviceId?: string | null;
}
