import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {
  SERVICE_QUALITIES,
  Service,
  type ServiceQuality,
} from '../../services/entities/service.entity';
import { Quote } from './quote.entity';

/**
 * One priced line of a quote. Name and price are copied from the rate, so a
 * later change of the price list never alters a quote already given.
 */
@Entity('quote_lines')
@Check('CHK_quote_lines_price', `"unitPrice" >= 0`)
@Check(
  'CHK_quote_lines_quality',
  `"quality" IS NULL OR "quality" IN (${SERVICE_QUALITIES.map((q) => `'${q}'`).join(', ')})`,
)
export class QuoteLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Quote, (q) => q.lines, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'quoteId',
    foreignKeyConstraintName: 'FK_quote_lines_quote',
  })
  quote?: Quote;

  @Index('IDX_quote_lines_quoteId')
  @Column('uuid')
  quoteId: string;

  @Column('int')
  position: number;

  @ManyToOne(() => Service, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'serviceId',
    foreignKeyConstraintName: 'FK_quote_lines_service',
  })
  service?: Service | null;

  @Column({ type: 'uuid', nullable: true })
  serviceId: string | null;

  @Column({ length: 150 })
  description: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  quality: ServiceQuality | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unitPrice: string;
}
