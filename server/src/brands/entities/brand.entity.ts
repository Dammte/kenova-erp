import { Model } from '../../models/entities/model.entity';
import { Entity } from 'typeorm/decorator/entity/Entity';
import {
  Column,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('brand')
export class Brand {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50 })
  name: string;

  @OneToMany(() => Model, (model) => model.brand)
  model: Model[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
