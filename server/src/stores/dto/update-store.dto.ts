import { IsBoolean, IsOptional } from 'class-validator';
import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateStoreDto } from './create-store.dto';

/** The prefix is not editable: printed order numbers must keep matching. */
export class UpdateStoreDto extends PartialType(
  OmitType(CreateStoreDto, ['prefix'] as const),
) {
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
