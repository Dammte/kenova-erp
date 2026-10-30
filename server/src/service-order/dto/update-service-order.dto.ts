import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { CreateServiceOrderDto } from './create-service-order.dto';

export class UpdateServiceOrderDto extends PartialType(
  OmitType(CreateServiceOrderDto, ['deviceId', 'inventoryIds'] as const),
) {
  /** null detaches the device from the order. */
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  @IsOptional()
  deviceId?: string | null;

  /** Only stored when the order is (or becomes) cancelled. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsString()
  @MaxLength(300)
  @IsOptional()
  cancelReason?: string | null;
}
