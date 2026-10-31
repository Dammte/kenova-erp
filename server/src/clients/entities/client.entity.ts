import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Device } from '../../devices/entities/device.entity';
import { ServiceOrder } from '../../service-order/entities/service-order.entity';
import { Store } from '../../stores/entities/store.entity';

export enum ContactMethod {
  EMAIL = 'EMAIL',
  PHONE = 'PHONE',
  SMS = 'SMS',
}

export enum DniType {
  NIF = 'NIF',
  NIE = 'NIE',
  PASSPORT = 'PASSPORT',
  /** A company: firstName holds its legal name, lastName the contact person. */
  CIF = 'CIF',
}

/** Shown when someone tries to use a client whose data was removed. */
export const ANONYMIZED_CLIENT =
  'Este cliente está anonimizado: sus datos personales se borraron';

@Entity()
export class Client {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: DniType, default: DniType.NIF })
  dniType: DniType;

  /** NULL when unknown: '' used to be the default and made the second client without DNI fail. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20, nullable: true, default: null })
  dni?: string | null;

  /** First name, or the legal name of a company. */
  @Column({ length: 100 })
  firstName: string;

  /** Optional: only the first name is required. */
  @Column({ type: 'varchar', length: 50, nullable: true, default: null })
  lastName: string | null;

  @Index()
  @Column({
    type: 'varchar',
    unique: true,
    nullable: true,
    length: 100,
    default: null,
  })
  email?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, default: null })
  phoneNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  postalCode: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  city: string | null;

  @Column({ type: 'enum', enum: ContactMethod, default: ContactMethod.PHONE })
  preferredContact: ContactMethod;

  @Column({ type: 'text', nullable: true })
  observations: string | null;

  @Column({ default: true })
  isActive: boolean;

  /**
   * The partner store that registered the client, so it sees the client before
   * its first order; NULL when registered by the workshop admins.
   */
  @ManyToOne(() => Store, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'storeId', foreignKeyConstraintName: 'FK_client_store' })
  store?: Store;

  @Index('IDX_client_storeId')
  @Column({ type: 'uuid', nullable: true, default: null })
  storeId: string | null;

  /**
   * When a workshop admin removed the client's personal data (RGPD). The row
   * stays so its orders and payments keep their history.
   */
  @Column({ type: 'timestamptz', nullable: true, default: null })
  anonymizedAt: Date | null;

  /** When it was merged into another client (design 3.3); the row stays, soft-deleted. */
  @ManyToOne(() => Client, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'mergedIntoId',
    foreignKeyConstraintName: 'FK_client_merged_into',
  })
  mergedInto?: Client | null;

  @Column({ type: 'uuid', nullable: true })
  mergedIntoId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  mergedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;

  @OneToMany(() => Device, (device) => device.client)
  devices: Device[];

  @OneToMany(() => ServiceOrder, (order) => order.client)
  serviceOrders: ServiceOrder[];
}
