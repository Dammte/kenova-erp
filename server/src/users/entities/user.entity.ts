import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
  Check,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ServiceHistory } from '../../service-history/entities/service-history.entity';
import { Store } from '../../stores/entities/store.entity';

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  STORE_ADMIN = 'STORE_ADMIN',
}

@Entity('users')
@Check('CHK_users_role', `"role" IN ('SUPER_ADMIN', 'STORE_ADMIN')`)
@Check(
  'CHK_users_store_admin_store',
  `"role" <> 'STORE_ADMIN' OR "storeId" IS NOT NULL`,
)
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 50 })
  username: string;

  @Column({ length: 100 })
  fullName: string;

  /** Always stored lower-cased (see UsersService.normalizeEmail). */
  @Index({ unique: true })
  @Column({ length: 100 })
  email: string;

  @Column({ type: 'varchar', length: 20, default: UserRole.STORE_ADMIN })
  role: UserRole;

  /** Argon2id PHC string. Never selected unless explicitly requested. */
  @Column({ type: 'text', nullable: true, select: false })
  passwordHash: string | null;

  @Column({ default: true })
  isActive: boolean;

  /** Required for STORE_ADMIN; a SUPER_ADMIN works across every store. */
  @Index('IDX_users_storeId')
  @Column({ type: 'uuid', nullable: true })
  storeId: string | null;

  @ManyToOne(() => Store, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'storeId', foreignKeyConstraintName: 'FK_users_store' })
  store?: Store | null;

  /** Set for accounts created with a temporary password. */
  @Column({ default: false })
  mustChangePassword: boolean;

  @Column({ type: 'int', default: 0, select: false })
  failedLoginCount: number;

  @Column({ type: 'timestamptz', nullable: true, select: false })
  lockedUntil: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true, select: false })
  passwordChangedAt: Date | null;

  @OneToMany(() => ServiceHistory, (history) => history.performedBy)
  serviceHistories: ServiceHistory[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
