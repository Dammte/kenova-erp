import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Device } from '../../devices/entities/device.entity';
import { ServiceOrder } from '../../service-order/entities/service-order.entity';

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

  @Column({ length: 50 })
  lastName: string;

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
