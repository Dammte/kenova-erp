import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import {
  TEMPLATE_MAX_LENGTH,
  TEMPLATE_TRIGGERS,
  type TemplateTrigger,
} from '../templates';

export class CreateNoticeDto {
  @IsIn(TEMPLATE_TRIGGERS, { message: 'Aviso no válido' })
  trigger: TemplateTrigger;

  /** The text as it went out, after the variables were filled in. */
  @IsString()
  @MinLength(1, { message: 'El aviso no tiene texto.' })
  @MaxLength(TEMPLATE_MAX_LENGTH, {
    message: `El aviso no puede pasar de ${TEMPLATE_MAX_LENGTH} caracteres.`,
  })
  body: string;
}
