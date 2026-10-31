import { IsOptional, IsString, IsUUID } from 'class-validator';

/** Whose templates: a partner may name any store; a store account only its own. */
export class TemplateStoreDto {
  @IsOptional()
  @IsUUID('4', { message: 'Tienda no válida' })
  storeId?: string;
}

export class SaveTemplateDto extends TemplateStoreDto {
  @IsString({ message: 'Escribe el texto del aviso.' })
  body: string;
}
