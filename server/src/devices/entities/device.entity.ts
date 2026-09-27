import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
  Check,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { ServiceOrder } from '../../service-order/entities/service-order.entity';
import { ServiceHistory } from '../../service-history/entities/service-history.entity';

export enum UnlockSecretType {
  CODE = 'CODE',
  PATTERN = 'PATTERN',
}

@Entity('devices')
@Check(
  'CHK_devices_unlockSecretType',
  `"unlockSecretType" IS NULL OR "unlockSecretType" IN ('CODE', 'PATTERN')`,
)
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 20, nullable: true })
  imei?: string;

  @Index({ unique: true })
  @Column({ length: 30, nullable: true })
  inventoryCode: string;

  @Column({ length: 30 })
  type: string;

  @Column({ length: 50 })
  brand: string;

  @Column({ length: 50 })
  model: string;

  @Column({ length: 50, nullable: true })
  status?: string;

  /**
   * Unlock PIN/password or pattern, encrypted with AES-256-GCM (see
   * DeviceSecretService). Never selected by default and never returned by the
   * API except through the audited reveal endpoint.
   */
  @Column({ type: 'text', nullable: true, select: false })
  unlockSecretCiphertext?: string | null;

  /** 'CODE' | 'PATTERN' when a secret is stored, otherwise null. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  unlockSecretType?: UnlockSecretType | null;

  @Column({ type: 'timestamptz', nullable: true })
  unlockSecretSetAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  observations: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Index('IDX_CLIENT_ID')
  @ManyToOne(() => Client, (client) => client.devices, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({
    name: 'client_id',
    type: 'uuid',
    nullable: true,
  })
  clientId: string;

  @OneToMany(() => ServiceOrder, (order) => order.device)
  serviceOrders: ServiceOrder[];

  @OneToMany(() => ServiceHistory, (history) => history.device)
  serviceHistories: ServiceHistory[];
}
