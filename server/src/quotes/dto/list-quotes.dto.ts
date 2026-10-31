import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { QUOTE_STATUSES, type QuoteStatus } from '../entities/quote.entity';

export const QUOTE_TABS = ['all', ...QUOTE_STATUSES, 'expired'] as const;
export type QuoteTab = 'all' | QuoteStatus;

export class ListQuotesDto {
  @IsOptional()
  @IsIn(QUOTE_TABS)
  tab: QuoteTab = 'all';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;
}
