import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

const trim = ({ value }) => (typeof value === 'string' ? value.trim() : value);
/** The wizard always sends both fields and leaves the unused one as ''. */
const blankToUndefined = ({ value }) =>
  value === null || (typeof value === 'string' && value.trim() === '')
    ? undefined
    : value;

/** Pattern-lock dots are numbered 1-9 and joined with "-" (e.g. "1-5-9"). */
export const PATTERN_REGEX = /^[1-9](-[1-9]){0,8}$/;

export class CreateDeviceDto {
  @IsUUID()
  clientId: string;

  @Transform(trim)
  @IsString()
  @MaxLength(20)
  @IsOptional()
  imei?: string | null;

  @Transform(trim)
  @IsString()
  @MaxLength(30)
  @IsOptional()
  inventoryCode?: string | null;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  type: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  brand: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  model: string;

  /** Unlock PIN/password. Write-only: stored encrypted, never returned. */
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(64)
  @IsOptional()
  code?: string | null;

  /** Unlock pattern. Write-only: stored encrypted, never returned. */
  @Transform(blankToUndefined)
  @IsString()
  @Matches(PATTERN_REGEX, { message: 'Patrón no válido' })
  @IsOptional()
  pattern?: string | null;

  @Transform(trim)
  @IsString()
  @MaxLength(50)
  @IsOptional()
  status?: string | null;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  observations?: string | null;
}
