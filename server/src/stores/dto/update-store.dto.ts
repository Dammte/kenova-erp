import { IsBoolean, IsOptional } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { CreateStoreDto } from './create-store.dto';

/**
 * A new prefix goes on the next orders and quotes, whose numbers carry on
 * (MP-0041, then KN-0042); the printed codes stay, and a prefix once used is
 * never given to another store.
 */
export class UpdateStoreDto extends PartialType(CreateStoreDto) {
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
