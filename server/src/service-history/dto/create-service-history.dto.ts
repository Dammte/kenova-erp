import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Who performed the action is taken from the session, never from the request. */
export class CreateServiceHistoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  action: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description: string;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  partsReplaced?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  @IsOptional()
  partsCost?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  @IsOptional()
  laborCost?: number;

  @IsUUID()
  serviceOrderId: string;

  @IsUUID()
  @IsOptional()
  deviceId?: string;
}
