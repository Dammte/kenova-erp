import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MIN_PASSWORD_LENGTH } from '../auth.constants';

export class RequestPasswordResetDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Introduce un email válido' })
  @MaxLength(100)
  email: string;
}

export class ConfirmPasswordResetDto {
  /** 32 random bytes in base64url. */
  @IsString()
  @Length(43, 43, { message: 'El enlace no es válido o ha caducado' })
  token: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`,
  })
  @MaxLength(256)
  newPassword: string;
}
