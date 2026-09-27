import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ConsumedPartDto {
  @IsUUID()
  inventoryId: string;

  @IsInt()
  @Min(1)
  @Max(1000)
  quantity: number;
}

export class ConsumePartsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ConsumedPartDto)
  parts: ConsumedPartDto[];
}
