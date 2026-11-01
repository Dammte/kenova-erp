import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaymentMethod } from '../../service-order/entities/service-order.entity';

/** What the partner store actually handed over for the month. */
export class SettleCommissionDto {
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Indica lo recibido en euros, con dos decimales como mucho' },
  )
  @Min(0, { message: 'Lo recibido no puede ser negativo' })
  @Max(99999999)
  received: number;

  /** AAAA-MM-DD. */
  @IsDateString({ strict: true }, { message: 'Indica la fecha de la entrega' })
  receivedOn: string;

  @IsEnum(PaymentMethod, { message: 'Elige cómo se entregó' })
  method: PaymentMethod;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string | null;
}
