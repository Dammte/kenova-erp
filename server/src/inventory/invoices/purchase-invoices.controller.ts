import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import type { AuthUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/entities/user.entity';
import { ConfirmInvoiceDto, PreviewInvoiceDto } from './invoice.dto';
import { invoiceFileType } from './invoice-reader';
import { InvoiceReaderService } from './invoice-reader.service';
import { PurchaseInvoicesService } from './purchase-invoices.service';

const MAX_BYTES = 10 * 1024 * 1024;

/** Supplier invoices into stock: partners only, like the stock (decision 5). */
@Roles(UserRole.SUPER_ADMIN)
@Controller('purchase-invoices')
export class PurchaseInvoicesController {
  constructor(
    private readonly invoices: PurchaseInvoicesService,
    private readonly reader: InvoiceReaderService,
  ) {}

  /** «Subir»: the invoice (PDF or photo) read with AI. Changes nothing. */
  @Post('read')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      // Multer stops reading at the limit instead of buffering the whole upload.
      limits: { fileSize: MAX_BYTES, files: 1, fields: 5 },
    }),
  )
  read(@UploadedFile() file?: Express.Multer.File) {
    if (!file?.buffer) throw new BadRequestException('Elige un archivo');
    const type = invoiceFileType(file.buffer);
    if (!type) {
      throw new BadRequestException('Solo se aceptan PDF, JPG o PNG');
    }
    return this.reader.read(file.buffer, type);
  }

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
