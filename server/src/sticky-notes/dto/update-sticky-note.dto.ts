import { PartialType } from '@nestjs/swagger';
import { CreateStickyNoteDto } from './create-sticky-note.dto';

export class UpdateStickyNoteDto extends PartialType(CreateStickyNoteDto) {}
