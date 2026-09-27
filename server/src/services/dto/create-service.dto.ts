import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  Min,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateServiceDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del servicio es obligatorio' })
  @MaxLength(100, { message: 'El nombre no puede exceder los 100 caracteres' })
  @ApiProperty({
    description: 'Nombre del servicio',
    example: 'Reparación de pantalla iPhone X',
    required: true,
  })
  name: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Descripción detallada del servicio',
    example:
      'Reemplazo completo de pantalla para iPhone X, incluye pantalla original y garantía de 3 meses.',
  })
  description: string;

  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El precio debe ser un número con máximo 2 decimales' },
  )
  @Min(0, { message: 'El precio no puede ser negativo' })
  @Type(() => Number)
  @ApiProperty({
    description: 'Precio del servicio',
    example: 150000,
    required: true,
  })
  price: number;

  @IsOptional()
  @IsString()
  @MaxLength(50, {
    message: 'El tiempo estimado no puede exceder los 50 caracteres',
  })
  @ApiProperty({
    description: 'Tiempo estimado para completar el servicio',
    example: '2-3 horas',
    required: false,
  })
  estimatedTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'La categoría no puede exceder los 50 caracteres' })
  @ApiProperty({
    description: 'Categoría del servicio',
    example: 'Reparación de pantalla',
    required: false,
  })
  category?: string;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    description: 'Indica si el servicio está disponible para los clientes',
    example: true,
    default: true,
    required: false,
  })
  available: boolean = true;
}
