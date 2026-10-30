import { IsString, Length } from 'class-validator';

export class ScanDto {
  /** The order code read from the label (VC-0036). */
  @IsString()
  @Length(1, 30)
  code: string;
}
