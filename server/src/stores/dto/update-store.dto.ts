import { IsBoolean, IsOptional } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { CreateStoreDto } from './create-store.dto';

/**
 * The prefix only changes while the store has no orders: printed order
 * numbers must keep matching.
 */
export class UpdateStoreDto extends PartialType(CreateStoreDto) {
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
