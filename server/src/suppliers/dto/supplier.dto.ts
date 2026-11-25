import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class CreateSupplierDto {
  @Transform(trim)
  @IsString()
  @Length(2, 80, { message: 'El nombre debe tener entre 2 y 80 caracteres' })
  name: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/[\s-]/g, '').toUpperCase() || null
      : value,
  )
  @IsOptional()
  @Matches(/^[A-Z0-9]{8,15}$/, { message: 'CIF no válido' })
  taxId?: string | null;

  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerNumber?: string | null;

  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  contactName?: string | null;

  @Transform(emptyToNull)
  @IsOptional()
  @IsEmail({}, { message: 'Email no válido' })
  @MaxLength(150)
  email?: string | null;

  @Transform(emptyToNull)
  @IsOptional()
  @Matches(/^\+?[\d\s]{6,20}$/, { message: 'Teléfono no válido' })
  phone?: string | null;

  @Transform(emptyToNull)
  @IsOptional()
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'La web debe empezar por https://' },
  )
  @MaxLength(200)
  website?: string | null;

  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
