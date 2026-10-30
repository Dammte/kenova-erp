import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

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
}
