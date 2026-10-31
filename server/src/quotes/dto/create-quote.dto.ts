import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  SERVICE_QUALITIES,
  type ServiceQuality,
} from '../../services/entities/service.entity';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const blankToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : trim({ value });
const isSet = (_: object, v: unknown) => v !== null && v !== undefined;

const AMOUNT = { maxDecimalPlaces: 2 } as const;
const amountMessage = { message: 'Los importes llevan como mucho 2 decimales' };
const nonNegative = { message: 'Los importes no pueden ser negativos' };

export class QuoteLineDto {
  @IsOptional()
  @ValidateIf(isSet)
  @IsUUID('4')
  serviceId?: string | null;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Cada línea necesita un concepto' })
  @MaxLength(150)
  description: string;

  @IsOptional()
  @ValidateIf(isSet)
  @IsIn(SERVICE_QUALITIES, {
    message: 'La calidad debe ser compatible u original',
  })
  quality?: ServiceQuality | null;

  @IsNumber(AMOUNT, amountMessage)
  @Min(0, nonNegative)
  @Type(() => Number)
  unitPrice: number;
}

/** Design 2.4: name and phone are enough; the rest is filled in when it becomes an order. */
export class CreateQuoteDto {
  @IsOptional()
  @ValidateIf(isSet)
  @IsUUID('4')
  clientId?: string | null;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Indica el nombre del cliente' })
  @MaxLength(120)
  clientName: string;

  @Transform(trim)
  @IsString()
  @Matches(/^\+?[\d\s().-]{6,20}$/, {
    message: 'Indica un teléfono válido para enviar el presupuesto',
  })
  clientPhone: string;

  @IsOptional()
  @ValidateIf(isSet)
  @IsUUID('4')
  deviceId?: string | null;

  @Transform(blankToNull)
  @IsOptional()
  @ValidateIf(isSet)
  @IsString()
  @MaxLength(60)
  brand?: string | null;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Indica el modelo del dispositivo' })
  @MaxLength(80)
  model: string;

  @Transform(blankToNull)
  @IsOptional()
  @ValidateIf(isSet)
  @IsString()
  @MaxLength(300)
  fault?: string | null;

  @IsOptional()
  @ValidateIf(isSet)
  @IsNumber(AMOUNT, amountMessage)
  @Min(0, nonNegative)
  @Type(() => Number)
  diagnosticFee?: number | null;

  @IsArray()
  @ArrayMinSize(1, { message: 'Añade al menos una línea' })
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuoteLineDto)
  lines: QuoteLineDto[];
}

export class UpdateQuoteDto extends PartialType(CreateQuoteDto) {}
