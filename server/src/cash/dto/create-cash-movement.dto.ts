import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CashMovementKind } from '../entities/cash-movement.entity';

export class CreateCashMovementDto {
  @IsOptional()
  @IsUUID('4', { message: 'Tienda no válida' })
  storeId?: string;

  @IsEnum(CashMovementKind, { message: 'Elige entrada o salida' })
  kind: CashMovementKind;

  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0.01, { message: 'Escribe un importe mayor que 0' })
  @Max(1_000_000)
  amount: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Escribe el motivo' })
  @MaxLength(200)
  reason: string;
}
