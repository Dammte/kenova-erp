import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MIN_PASSWORD_LENGTH } from '../../auth/auth.constants';
import { UserRole } from '../entities/user.entity';

const trim = ({ value }) => (typeof value === 'string' ? value.trim() : value);

export class CreateUserDto {
  @Transform(trim)
  @IsString()
  @Length(3, 50)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message:
      'El usuario solo puede contener letras, números, punto, guion y guion bajo',
  })
  username: string;

  @Transform(trim)
  @IsString()
  @Length(3, 100)
  fullName: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(100)
  email: string;

  /** Temporary password: the user must change it on first login. */
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(256)
  temporaryPassword: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;
}
