import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsUUID,
} from 'class-validator';
import { ServiceStatus } from '../entities/service-order.entity';

/** The statuses the list changes on the spot; the rest ask for more. */
export const BULK_STATUSES = [
  ServiceStatus.PENDIENTE_CLIENTE,
  ServiceStatus.EN_PROGRESO,
  ServiceStatus.PENDIENTE_PIEZAS,
] as const;

/** Design R3 B4: one status for several orders picked in the list. */
export class BulkStatusDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  ids: string[];

  @IsIn(BULK_STATUSES, {
    message:
      'En lote solo se cambia a Pendiente de cliente, En progreso o Pendiente de piezas',
  })
  status: (typeof BULK_STATUSES)[number];
}
