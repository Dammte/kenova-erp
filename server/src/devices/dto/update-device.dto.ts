import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateDeviceDto } from './create-device.dto';

/**
 * The owner of a device cannot be changed through this endpoint.
 * `code` / `pattern`: omitted or empty keeps the stored secret; a value
 * replaces it. Use DELETE /devices/:id/unlock-secret to remove it.
 */
export class UpdateDeviceDto extends PartialType(
  OmitType(CreateDeviceDto, ['clientId'] as const),
) {}
