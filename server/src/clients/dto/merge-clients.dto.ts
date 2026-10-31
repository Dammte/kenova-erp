import { Type } from 'class-transformer';
import { IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { UpdateClientDto } from './update-client.dto';

export class MergeClientsDto {
  /** The duplicate whose orders, devices and quotes move to the kept client. */
  @IsUUID('4', { message: 'Cliente no válido' })
  fromId: string;

  /** The values picked field by field for the kept client. */
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateClientDto)
  data?: UpdateClientDto;
}

export class NotDuplicateDto {
  @IsUUID('4', { message: 'Cliente no válido' })
  otherId: string;
}
