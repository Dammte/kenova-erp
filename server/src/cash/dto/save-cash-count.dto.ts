import { Transform } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const money = { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false };

export class SaveCashCountDto {
  @IsOptional()
  @IsUUID('4', { message: 'Tienda no válida' })
  storeId?: string;

  /** Cash counted in the drawer. */
  @ValidateIf((o: SaveCashCountDto) => o.cash !== null)
  @IsOptional()
  @IsNumber(money, { message: 'Efectivo contado no válido' })
  @Min(0)
  @Max(1_000_000)
  cash?: number | null;

  /** The card terminal's total for the day. */
  @ValidateIf((o: SaveCashCountDto) => o.terminal !== null)
  @IsOptional()
  @IsNumber(money, { message: 'Total del datáfono no válido' })
  @Min(0)
  @Max(1_000_000)
  terminal?: number | null;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string | null;
}
