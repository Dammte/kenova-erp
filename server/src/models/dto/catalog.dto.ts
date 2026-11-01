import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  MODEL_DEVICE_TYPES,
  type ModelDeviceType,
} from '../entities/model.entity';

/** PATCH /api/catalog/models/:id: rename, set the type, withdraw or restore. */
export class UpdateCatalogModelDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Escribe el nombre del modelo' })
  @MaxLength(50, { message: 'El nombre no puede pasar de 50 caracteres' })
  name?: string;

  @IsOptional()
  @IsIn(MODEL_DEVICE_TYPES, { message: 'Tipo de equipo no válido' })
  deviceType?: ModelDeviceType;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** POST /api/catalog/models/:id/merge: the duplicate that goes into :id. */
export class MergeModelsDto {
  @IsUUID('4', { message: 'Modelo no válido' })
  fromId: string;
}
