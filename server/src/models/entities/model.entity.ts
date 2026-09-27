import {
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Brand } from '../../brands/entities/brand.entity';
import { Entity } from 'typeorm/decorator/entity/Entity';

@Entity('model')
export class Model {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Brand, (brand) => brand.model)
  @JoinColumn({ name: 'brandId' })
  brand: Brand;

  @Column('uuid', { nullable: true })
  brandId?: string;

  @Column({ length: 50 })
  name: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
