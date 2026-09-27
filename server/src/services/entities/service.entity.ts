import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
} from 'typeorm';
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
import { ServiceOrder } from '../../service-order/entities/service-order.entity';

@Entity('services')
export class Service {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty({
    description: 'ID único del servicio',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  id: string;

  @Column({ length: 100 })
  @IsString()
  @IsNotEmpty({ message: 'El nombre del servicio es obligatorio' })
  @MaxLength(100, { message: 'El nombre no puede exceder los 100 caracteres' })
  @ApiProperty({
    description: 'Nombre del servicio',
    example: 'Reparación de pantalla iPhone X',
  })
  name: string;

  @Column({ type: 'text' })
  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Descripción detallada del servicio',
    example:
      'Reemplazo completo de pantalla para iPhone X, incluye pantalla original y garantía de 3 meses.',
    required: false,
  })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El precio debe ser un número con máximo 2 decimales' },
  )
  @Min(0, { message: 'El precio no puede ser negativo' })
  @ApiProperty({ description: 'Precio del servicio', example: 150000 })
  price: number;

  @Column({ nullable: true })
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

  @Column({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'La categoría no puede exceder los 50 caracteres' })
  @ApiProperty({
    description: 'Categoría del servicio',
    example: 'Reparación de pantalla',
    required: false,
  })
  category?: string;

  @Column({ default: true })
  @IsBoolean()
  @ApiProperty({
    description: 'Indica si el servicio está disponible para los clientes',
    example: true,
  })
  available: boolean;

  @ManyToMany(() => ServiceOrder, (serviceOrder) => serviceOrder.services)
  serviceOrders: ServiceOrder[];

  @CreateDateColumn({ type: 'timestamp' })
  @ApiProperty({ description: 'Fecha de creación del registro' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  @ApiProperty({ description: 'Fecha de última actualización del registro' })
  updatedAt: Date;
}
