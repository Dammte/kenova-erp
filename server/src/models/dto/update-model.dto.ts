import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateModelDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsUUID()
  brandId?: string;
}
