import {
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Check,
} from 'typeorm';
import { Brand } from '../../brands/entities/brand.entity';
import { Entity } from 'typeorm/decorator/entity/Entity';

export const MODEL_DEVICE_TYPES = [
  'movil',
  'tablet',
  'computador',
  'otro',
] as const;
export type ModelDeviceType = (typeof MODEL_DEVICE_TYPES)[number];

@Entity('model')
@Check(
  'CHK_model_device_type',
  `"deviceType" IN ('movil', 'tablet', 'computador', 'otro')`,
)
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

  /**
   * Design R2 3.8: the device type proposed at intake for this model
   * (movil, tablet, computador, otro); null while nobody has set it.
   */
  @Column({ type: 'varchar', length: 20, nullable: true })
  deviceType: ModelDeviceType | null;

  /** A withdrawn model is not offered at intake; its devices and rates stay. */
  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
