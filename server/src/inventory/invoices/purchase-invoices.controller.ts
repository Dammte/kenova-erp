import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import type { AuthUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/entities/user.entity';
import { ConfirmInvoiceDto, PreviewInvoiceDto } from './invoice.dto';
import { PurchaseInvoicesService } from './purchase-invoices.service';

/** Supplier invoices into stock: partners only, like the stock (decision 5). */
@Roles(UserRole.SUPER_ADMIN)
@Controller('purchase-invoices')
export class PurchaseInvoicesController {
  constructor(private readonly invoices: PurchaseInvoicesService) {}

  /** «Revisar»: how each line matches the stock. Changes nothing. */
  @Post('preview')
  @HttpCode(200)
  preview(@Body() dto: PreviewInvoiceDto) {
    return this.invoices.preview(dto);
  }

  /** «Confirmar entrada»: every line into stock in one go. */
  @Post()
  confirm(@Body() dto: ConfirmInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.invoices.confirm(dto, user);
  }
}
