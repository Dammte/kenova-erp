import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;
const money = ({ value }: { value: unknown }) =>
  typeof value === 'number'
    ? String(value)
    : typeof value === 'string'
      ? value.trim().replace(',', '.')
      : value;

/** A line as read from the invoice (or typed by hand). */
export class InvoiceLineDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Cada línea necesita una descripción' })
  @MaxLength(150)
  description: string;

  /** The supplier's reference for the part. */
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  ref?: string | null;

  @IsInt({ message: 'La cantidad es un número entero' })
  @Min(1, { message: 'La cantidad mínima es 1' })
  @Max(100_000)
  quantity: number;

  /** Cost of one unit, before tax. */
  @Transform(money)
  @Matches(/^\d{1,8}(\.\d{1,4})?$/, { message: 'Coste por unidad no válido' })
  unitCost: string;
}

export class InvoiceHeadDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Indica el proveedor' })
  @MaxLength(50)
  provider: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  number?: string | null;
}

export class PreviewInvoiceDto extends InvoiceHeadDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'La factura no tiene líneas' })
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines: InvoiceLineDto[];
}

/** A part created from a line that is not in stock yet. */
export class NewPartDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El repuesto nuevo necesita un nombre' })
  @MaxLength(100)
  name: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(20)
  sku?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string | null;
}

export class ConfirmLineDto extends InvoiceLineDto {
  /** The stock part it goes into… */
  @IsOptional()
  @IsUUID('4', { message: 'Repuesto no válido' })
  inventoryId?: string;

  /** …or the part it creates. */
  @IsOptional()
  @ValidateNested()
  @Type(() => NewPartDto)
  newPart?: NewPartDto;
}

export class ConfirmInvoiceDto extends InvoiceHeadDto {
  @Transform(trim)
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha de factura no válida' })
  invoiceDate?: string | null;

  /** Enter it even though this supplier's invoice number was entered before. */
  @IsOptional()
  @IsBoolean()
  allowDuplicate?: boolean;

  @IsArray()
  @ArrayMinSize(1, { message: 'La factura no tiene líneas' })
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ConfirmLineDto)
  lines: ConfirmLineDto[];
}
