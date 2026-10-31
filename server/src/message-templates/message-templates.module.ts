import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceOrderModule } from '../service-order/service-order.module';
import { MessageTemplate } from './entities/message-template.entity';
import { OrderNotice } from './entities/order-notice.entity';
import { MessageTemplatesController } from './message-templates.controller';
import { MessageTemplatesService } from './message-templates.service';
import { NoticesController } from './notices.controller';
import { NoticesService } from './notices.service';
import { RemindersController } from './reminders.controller';

/** Design 2.5: the store's notice texts and the notices sent on each order. */
@Module({
  imports: [
    ServiceOrderModule,
    TypeOrmModule.forFeature([MessageTemplate, OrderNotice]),
  ],
  controllers: [
    MessageTemplatesController,
    NoticesController,
    RemindersController,
  ],
  providers: [MessageTemplatesService, NoticesService],
  exports: [MessageTemplatesService, NoticesService],
})
export class MessageTemplatesModule {}
