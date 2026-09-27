import { IsNotEmpty, IsString, IsEnum, MaxLength } from 'class-validator';

export class CreateStickyNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;

  @IsEnum(['normal', 'important', 'urgent'])
  type: 'normal' | 'important' | 'urgent';
}
