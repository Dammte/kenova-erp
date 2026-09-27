import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ContactMethod, DniType } from '../../clients/entities/client.entity';

const trim = ({ value }) => (typeof value === 'string' ? value.trim() : value);
/** Empty strings become null so optional unique columns (dni, email) never collide on "". */
const emptyToNull = ({ value }) => {
  if (typeof value !== 'string') return value;
  const v = value.trim();
  return v === '' ? null : v;
};

/** '' from a select with no choice means "not provided". */
const blankToUndefined = ({ value }) =>
  value === '' || value === null ? undefined : value;

export class CreateClientDto {
  @Transform(blankToUndefined)
  @IsEnum(DniType)
  @IsOptional()
  dniType?: DniType;

  @Transform(({ value }) => {
    const v = emptyToNull({ value });
    return typeof v === 'string' ? v.toUpperCase() : v;
  })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  dni?: string | null;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  firstName: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  lastName: string;

  @Transform(({ value }) => {
    const v = emptyToNull({ value });
    return typeof v === 'string' ? v.toLowerCase() : v;
  })
  @IsEmail()
  @MaxLength(100)
  @IsOptional()
  email?: string | null;

  @Transform(emptyToNull)
  @IsString()
  @MaxLength(20)
  @IsOptional()
  phoneNumber?: string | null;

  @Transform(emptyToNull)
  @IsString()
  @MaxLength(255)
  @IsOptional()
  address?: string | null;

  @Transform(emptyToNull)
  @IsString()
  @MaxLength(10)
  @IsOptional()
  postalCode?: string | null;

  @Transform(emptyToNull)
  @IsString()
  @MaxLength(50)
  @IsOptional()
  city?: string | null;

  @Transform(blankToUndefined)
  @IsEnum(ContactMethod)
  @IsOptional()
  preferredContact?: ContactMethod;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  observations?: string | null;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
