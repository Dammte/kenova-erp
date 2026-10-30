import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ServiceStatus } from '../entities/service-order.entity';

/** Tabs of the order list: the open ones, each status, or everything. */
export const ORDER_TABS = ['open', 'all', ...Object.values(ServiceStatus)];
export type OrderTab = 'open' | 'all' | ServiceStatus;

export class ListOrdersDto {
  @IsOptional()
  @IsIn(ORDER_TABS)
  tab: OrderTab = 'open';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  /** Only orders with money still owed. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  debt?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;
}
