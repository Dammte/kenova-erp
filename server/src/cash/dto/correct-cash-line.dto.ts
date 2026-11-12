import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CASH_METHODS, type CashMethod } from '../cash.service';

/**
 * Design 3.2 «Corregir un día cerrado»: the method of a charge or refund, or
 * the amount of an entry or exit, always with the reason.
 */
export class CorrectCashLineDto {
  @IsOptional()
  @IsUUID('4', { message: 'Tienda no válida' })
  storeId?: string;

  @IsUUID('4', { message: 'Movimiento no válido' })
  lineId: string;

  @IsOptional()
  @IsIn(CASH_METHODS, { message: 'Forma de pago no válida' })
  method?: CashMethod;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0.01, { message: 'Escribe un importe mayor que 0' })
  @Max(1_000_000)
  amount?: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Escribe el motivo de la corrección' })
  @MaxLength(200)
  reason: string;
}
