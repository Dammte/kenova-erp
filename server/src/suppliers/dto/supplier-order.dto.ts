import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  SUPPLIER_ORDER_STATES,
  type SupplierOrderState,
} from '../entities/supplier-order.entity';
import type { ChosenState } from '../orders/supplier-orders.service';

export class ListSupplierOrdersDto {
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsIn(SUPPLIER_ORDER_STATES)
  state?: SupplierOrderState;

  /** The order's reference, or a line's reference or product. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;
}

const CHOSEN: ChosenState[] = ['PENDIENTE', 'DESCARTADO', 'ANTERIOR'];

export class SupplierOrderStateDto {
  @IsIn(CHOSEN, {
    message: 'El estado debe ser pendiente, descartado o anterior',
  })
  state: ChosenState;
}
