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
}

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

  @Column({ length: 50 })
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

  @Column({ nullable: true })
  address: string;

  @Column({ length: 10, nullable: true })
  postalCode: string;

  @Column({ length: 50, nullable: true })
  city: string;

  @Column({ type: 'enum', enum: ContactMethod, default: ContactMethod.PHONE })
  preferredContact: ContactMethod;

  @Column({ type: 'text', nullable: true })
  observations: string;

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
