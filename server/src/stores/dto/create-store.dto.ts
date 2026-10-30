import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CommissionType, MIN_WARRANTY_DAYS } from '../entities/store.entity';

const HOUR = /^([01]\d|2[0-3]):[0-5]\d:00$/;
const toTime = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d{2}:\d{2}$/.test(value.trim())
    ? `${value.trim()}:00`
    : value;

const trim = ({ value }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class CreateStoreDto {
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  name: string;

  @Transform(trim)
  @IsString()
  @Length(2, 80)
  city: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z]{2,4}$/, {
    message: 'El prefijo debe tener de 2 a 4 letras (por ejemplo, VC)',
  })
  prefix: string;

  @Transform(emptyToNull)
  @IsString()
  @MaxLength(150)
  @IsOptional()
  address?: string | null;

  @Transform(emptyToNull)
  @IsString()
  @MaxLength(20)
  @IsOptional()
  phone?: string | null;

  @Transform(emptyToNull)
  @IsString()
  @MaxLength(150)
  @IsOptional()
  legalName?: string | null;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() || null : value,
  )
  @IsString()
  @MaxLength(20)
  @IsOptional()
  taxId?: string | null;

  /** "HH:MM", 24 h; stored as "HH:MM:00", as the database returns it. */
  @Transform(toTime)
  @Matches(HOUR, { message: 'Escribe la hora de apertura como 09:00' })
  @IsOptional()
  cashOpensAt?: string;

  @Transform(toTime)
  @Matches(HOUR, { message: 'Escribe la hora de cierre como 20:00' })
  @IsOptional()
  cashClosesAt?: string;

  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0, { message: 'El fondo inicial no puede ser negativo' })
  @Max(100_000)
  @IsOptional()
  cashFloat?: number;

  @IsInt()
  @Min(MIN_WARRANTY_DAYS, {
    message: `La garantía no puede ser inferior a ${MIN_WARRANTY_DAYS} días`,
  })
  @Max(3650)
  @IsOptional()
  warrantyDays?: number;

  /** null removes the commission; send it together with its value. */
  @IsEnum(CommissionType)
  @IsOptional()
  commissionType?: CommissionType | null;

  /** Percentage (0-100) or euros per device, as the type says. */
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0, { message: 'La comisión no puede ser negativa' })
  @Max(10_000)
  @IsOptional()
  commissionValue?: number | null;
}
