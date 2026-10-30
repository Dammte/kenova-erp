import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const trimToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class CreateShipmentDto {
  /** The orders whose devices travel in it. */
  @IsArray()
  @ArrayNotEmpty({ message: 'Añade al menos un equipo' })
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  orderIds: string[];

  /**
   * The partner store a workshop shipment goes back to. A partner store
   * always ships to the workshop, so it leaves it out.
   */
  @IsOptional()
  @IsUUID()
  toStoreId?: string;

  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  carrier?: string | null;
}
