import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A shop that takes devices in. The main store is Kenova's workshop (Medina de
 * Pomar), where repairs happen; the others are partner reception points.
 */
@Entity('stores')
// At most one workshop.
@Index('IDX_stores_single_main', ['isMain'], {
  unique: true,
  where: '"isMain"',
})
@Check('CHK_stores_prefix', `"prefix" ~ '^[A-Z]{2,4}$'`)
export class Store {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 80 })
  name: string;

  @Column({ length: 80 })
  city: string;

  /** Order-number prefix (MP-0142). Fixed once created. */
  @Index('IDX_stores_prefix', { unique: true })
  @Column({ length: 4 })
  prefix: string;

  /** Printed on tickets. */
  @Column({ type: 'varchar', length: 150, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  /** Exactly one store is the workshop: it holds the stock and does repairs. */
  @Column({ default: false })
  isMain: boolean;

  /** An inactive store takes no new orders and its users cannot sign in. */
  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
