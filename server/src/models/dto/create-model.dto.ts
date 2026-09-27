import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateModelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @IsUUID()
  @IsNotEmpty()
  brandId: string;
}
