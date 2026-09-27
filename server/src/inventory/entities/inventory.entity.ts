import {
  PrimaryGeneratedColumn,
  Index,
  Column,
  Entity,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Check,
} from 'typeorm';

@Entity('inventory')
@Check('CHK_inventory_stock_nonnegative', `"stock" IS NULL OR "stock" >= 0`)
export class Inventory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 20 })
  sku: string;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 150, nullable: true })
  description?: string;

  @Column({ length: 50, nullable: true })
  imagePath?: string;

  @Column({ length: 50, nullable: true })
  brand?: string;

  @Column({ length: 50, nullable: true })
  category?: string;

  @Column({ length: 50, nullable: true })
  model?: string;

  @Column({ length: 50, nullable: true })
  ubication?: string;

  @Column({ length: 50, nullable: true })
  provider?: string;

  @Column({ type: 'int', nullable: true })
  stock?: number;

  @Column({ type: 'int', nullable: true })
  minimalStock?: number;

  @Column({ type: 'decimal', nullable: true })
  salesPrice?: number;

  @Column({ length: 50, nullable: true })
  costPrice?: string;

  @Column({ length: 50, nullable: true })
  createdBy?: string;

  @Column({ length: 50, nullable: true })
  updatedBy?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt: Date;
}
