import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceOrderModule } from '../service-order/service-order.module';
import { QuoteLine } from './entities/quote-line.entity';
import { Quote } from './entities/quote.entity';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  imports: [ServiceOrderModule, TypeOrmModule.forFeature([Quote, QuoteLine])],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}
