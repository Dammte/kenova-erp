import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A company Kenova buys parts from. Never deleted: a supplier that is no
 * longer used is deactivated, so past purchases keep their name.
 * The name is unique ignoring case (index UQ_suppliers_name on lower(name)).
 */
@Entity('suppliers')
export class Supplier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  /** CIF / NIF. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  taxId: string | null;

  /** Kenova's customer number at the supplier. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  customerNumber: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  contactName: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  website: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  notes: string | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
