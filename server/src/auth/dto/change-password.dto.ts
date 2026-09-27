import { IsString, MaxLength, MinLength } from 'class-validator';
import { MIN_PASSWORD_LENGTH } from '../auth.constants';

export class ChangePasswordDto {
  @IsString()
  @MaxLength(256)
  currentPassword: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`,
  })
  @MaxLength(256)
  newPassword: string;
}
