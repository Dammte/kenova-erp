import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class CreatePartOrderDto {
  @IsUUID('4', { message: 'Orden no válida' })
  orderId: string;

  /** A stock part; without it, partName says what is ordered. */
  @IsOptional()
  @IsUUID('4', { message: 'Repuesto no válido' })
  inventoryId?: string;

  @Transform(trim)
  @ValidateIf((o: CreatePartOrderDto) => !o.inventoryId)
  @IsString()
  @IsNotEmpty({ message: 'Escribe la pieza que falta' })
  @MaxLength(150)
  partName?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  provider?: string | null;

  @IsOptional()
  @IsInt({ message: 'La cantidad es un número entero' })
  @Min(1)
  @Max(999)
  quantity?: number;

  @Transform(trim)
  @IsOptional()
  @Matches(DAY, { message: 'Fecha de llegada no válida' })
  expectedAt?: string | null;
}

export class ListPartOrdersDto {
  @IsOptional()
  @IsUUID('4')
  orderId?: string;

  /** Only those not received yet. */
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === 'true' || value === true,
  )
  @IsBoolean()
  pending?: boolean;
}
