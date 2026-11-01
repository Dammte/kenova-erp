import { IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class LoginDto {
  /**
   * «Email o usuario». The field keeps its old name so older clients still
   * work; anything that is not an email is looked up as a username.
   */
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password: string;
}
