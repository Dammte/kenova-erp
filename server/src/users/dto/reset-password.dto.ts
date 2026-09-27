import { IsString, MaxLength, MinLength } from 'class-validator';
import { MIN_PASSWORD_LENGTH } from '../../auth/auth.constants';

export class ResetPasswordDto {
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(256)
  temporaryPassword: string;
}
