import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }) => (typeof value === 'string' ? value.trim() : value);
/** Accepts numbers or numeric strings ("12.50" from PostgreSQL decimals, "12,5" typed by hand). */
const toNumber = ({ value }) => {
  if (value === '' || value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const n = Number(value.replace(',', '.'));
    return Number.isNaN(n) ? value : n;
  }
  return value;
};
/** costPrice is still a text column (see audit ECO-001); only well-formed amounts are stored. */
const toDecimalString = ({ value }) => {
  if (value === '' || value === null || value === undefined) return undefined;
  if (typeof value === 'number')
    return Number.isFinite(value) ? String(value) : 'NaN';
  return typeof value === 'string' ? value.trim().replace(',', '.') : value;
};

export class CreateInventoryDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  sku: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  imagePath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  ubication?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  provider?: string;

  @Transform(toNumber)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock?: number;

  @Transform(toNumber)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  minimalStock?: number;

  @Transform(toNumber)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1_000_000)
  salesPrice?: number;

  @Transform(toDecimalString)
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,8}(\.\d{1,4})?$/, {
    message:
      'El precio de coste debe ser un número positivo (máx. 4 decimales)',
  })
  costPrice?: string;
}
