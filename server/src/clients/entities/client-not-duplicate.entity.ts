import {
  Check,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Column,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Client } from './client.entity';

/**
 * Two clients someone said are not the same person («No es la misma
 * persona»), so the list stops flagging them. Stored once, smaller id first.
 */
@Entity('client_not_duplicates')
@Check('CHK_client_not_duplicates_order', `"clientAId" < "clientBId"`)
export class ClientNotDuplicate {
  @PrimaryColumn({
    type: 'uuid',
    primaryKeyConstraintName: 'PK_client_not_duplicates',
  })
  clientAId: string;

  @PrimaryColumn({
    type: 'uuid',
    primaryKeyConstraintName: 'PK_client_not_duplicates',
  })
  clientBId: string;

  @ManyToOne(() => Client, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'clientAId',
    foreignKeyConstraintName: 'FK_client_not_duplicates_a',
  })
  clientA?: Client;

  @ManyToOne(() => Client, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'clientBId',
    foreignKeyConstraintName: 'FK_client_not_duplicates_b',
  })
  clientB?: Client;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'createdById',
    foreignKeyConstraintName: 'FK_client_not_duplicates_user',
  })
  createdBy?: User | null;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
