import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * Single-use, short-lived password reset link. Like sessions, only the
 * SHA-256 of the token is stored: a database dump cannot be used to reset
 * anyone's password.
 */
@Entity('password_reset_tokens')
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_password_reset_tokens_tokenHash', { unique: true })
  @Column({ type: 'char', length: 64 })
  tokenHash: string;

  @Index('IDX_password_reset_tokens_userId')
  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'FK_password_reset_tokens_user',
  })
  user: User;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  requestIp: string | null;
}
