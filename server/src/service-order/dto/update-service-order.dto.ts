import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  ORDER_TESTS,
  OrderResult,
  OrderTest,
} from '../entities/service-order.entity';
import { ConsumedPartDto } from './consume-parts.dto';
import { CreateServiceOrderDto } from './create-service-order.dto';

const trimToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class UpdateServiceOrderDto extends PartialType(
  OmitType(CreateServiceOrderDto, ['deviceId', 'inventoryIds'] as const),
) {
  /** null detaches the device from the order. */
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  @IsOptional()
  deviceId?: string | null;

  /** Only stored when the order is (or becomes) cancelled. */
  @Transform(trimToNull)
  @IsString()
  @MaxLength(300)
  @IsOptional()
  cancelReason?: string | null;

  @Transform(trimToNull)
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  workDone?: string | null;

  @IsArray()
  @ArrayUnique()
  @IsIn(ORDER_TESTS, { each: true })
  @IsOptional()
  testsDone?: OrderTest[];

  /** Only for a finished or delivered order; null clears it. */
  @ValidateIf((_, v) => v !== null)
  @IsEnum(OrderResult)
  @IsOptional()
  result?: OrderResult | null;

  /** Required when the result is "not repaired". */
  @Transform(trimToNull)
  @IsString()
  @MaxLength(300)
  @IsOptional()
  notRepairedReason?: string | null;

  /** "Garantía no procede": only on a warranty claim; null clears it. */
  @Transform(trimToNull)
  @IsString()
  @MaxLength(300)
  @IsOptional()
  warrantyRejectedReason?: string | null;

  /**
   * Why the order is handed over with money still owed. Not a column: it only
   * goes to the history when the order becomes delivered with a balance.
   */
  @Transform(trimToNull)
  @IsString()
  @MaxLength(300)
  @IsOptional()
  owedReason?: string | null;

  /**
   * Parts used, taken out of stock in the same transaction as the change
   * (usually finishing the order). Not a column.
   */
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ConsumedPartDto)
  @IsOptional()
  parts?: ConsumedPartDto[];
}
