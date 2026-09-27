import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PaymentMethod,
  Priority,
  ServiceStatus,
} from '../entities/service-order.entity';

const MAX_AMOUNT = 1_000_000;
const lower = ({ value }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const blankToUndefined = ({ value }) =>
  value === '' || value === null ? undefined : value;

/**
 * `paymentStatus` and `balance` are not accepted: the server derives them from
 * `totalPrice` and `amountPaid`, so a request cannot mark an unpaid order as paid.
 */
export class CreateServiceOrderDto {
  @IsUUID()
  clientId: string;

  @IsUUID()
  @IsOptional()
  deviceId?: string;

  @Transform(lower)
  @IsEnum(Priority)
  @IsOptional()
  priority?: Priority;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  assignedTo?: string;

  @Transform(lower)
  @IsEnum(ServiceStatus)
  @IsOptional()
  status?: ServiceStatus;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(MAX_AMOUNT)
  @IsOptional()
  totalPrice?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(MAX_AMOUNT)
  @IsOptional()
  amountPaid?: number;

  @Transform(({ value }) => blankToUndefined({ value: lower({ value }) }))
  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;

  @IsString()
  @MaxLength(5000)
  @IsOptional()
  observations?: string;

  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  @IsOptional()
  serviceIds?: string[];

  /** Accepted for compatibility with the current frontend; parts are consumed via /consume-parts. */
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  @IsOptional()
  inventoryIds?: string[];
}
