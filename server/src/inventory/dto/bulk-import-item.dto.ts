import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class BulkImportItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  sku?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @IsInt()
  @Min(0)
  @Max(100_000)
  stock: number;

  @Transform(({ value }) =>
    value === '' || value === null || value === undefined
      ? undefined
      : String(value).trim().replace(',', '.'),
  )
  @IsOptional()
  @Matches(/^\d{1,8}(\.\d{1,4})?$/)
  costPrice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  provider?: string;

  /** When set, skip SKU lookup and merge directly into this inventory item by ID */
  @IsOptional()
  @IsUUID()
  mergeWithId?: string;
}
