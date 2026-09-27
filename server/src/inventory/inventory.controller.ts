import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseInterceptors,
  UploadedFile,
  HttpException,
  BadRequestException,
  ParseArrayPipe,
  ParseUUIDPipe,
  HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
import { InventoryService } from './inventory.service';
import {
  InventoryImportService,
  ParsedInventoryItem,
} from './inventory-import.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { BulkImportItemDto } from './dto/bulk-import-item.dto';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

const MAX_PDF_BYTES = 10 * 1024 * 1024;

@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly inventoryImportService: InventoryImportService,
  ) {}

  // ── IMPORT: Analyze PDF with Claude ─────────────────────────────────────────

  @Post('import/analyze')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      // Multer stops reading at the limit instead of buffering the whole upload.
      limits: { fileSize: MAX_PDF_BYTES, files: 1, fields: 5 },
    }),
  )
  async analyzeImport(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ParsedInventoryItem[]> {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }
    // The declared mimetype comes from the client; check the actual file signature.
    if (
      file.mimetype !== 'application/pdf' ||
      !file.buffer?.subarray(0, 5).equals(Buffer.from('%PDF-'))
    ) {
      throw new BadRequestException('Solo se aceptan archivos PDF');
    }
    if (file.size > MAX_PDF_BYTES) {
      throw new BadRequestException('El archivo no puede superar 10 MB');
    }
    return this.inventoryImportService.analyzeInvoice(file.buffer);
  }

  // ── IMPORT: Bulk create / update stock ──────────────────────────────────────

  @Post('bulk')
  async bulkCreate(
    @Body(new ParseArrayPipe({ items: BulkImportItemDto, whitelist: true }))
    items: BulkImportItemDto[],
    @CurrentUser() user: AuthUser,
  ) {
    if (items.length === 0 || items.length > 500) {
      throw new BadRequestException('La lista debe tener entre 1 y 500 ítems');
    }

    const results: {
      action: string;
      name: string;
      id?: string;
      error?: string;
    }[] = [];

    for (const item of items) {
      try {
        if (!item.name) {
          results.push({
            action: 'error',
            name: '?',
            error: 'Nombre obligatorio',
          });
          continue;
        }

        // ── Case 1: frontend explicitly resolved the conflict → merge by ID ──
        if (item.mergeWithId) {
          const target = await this.inventoryService.findOne(item.mergeWithId);
          if (target) {
            await this.inventoryService.addStock(
              target.id,
              item.stock,
              item.costPrice,
              user.id,
            );
            results.push({ action: 'merged', name: item.name, id: target.id });
            continue;
          }
        }

        // ── Case 2: no mergeWithId → try SKU lookup (case-insensitive) ──────
        if (!item.sku) {
          results.push({
            action: 'error',
            name: item.name,
            error: 'SKU obligatorio para nuevos ítems',
          });
          continue;
        }

        const existing = await this.inventoryService.findOneBySku(item.sku);

        if (existing) {
          await this.inventoryService.addStock(
            existing.id,
            item.stock,
            item.costPrice,
            user.id,
          );
          results.push({ action: 'updated', name: item.name, id: existing.id });
        } else {
          const created = await this.inventoryService.create({
            sku: item.sku,
            name: item.name,
            description: item.description,
            brand: item.brand,
            category: item.category,
            provider: item.provider,
            stock: item.stock ?? 0,
            minimalStock: 0,
            salesPrice: 0,
            costPrice: item.costPrice ?? '0',
            createdBy: user.id,
            updatedBy: user.id,
          });
          results.push({ action: 'created', name: item.name, id: created.id });
        }
      } catch (err: any) {
        results.push({
          action: 'error',
          name: item.name ?? '?',
          error:
            err instanceof HttpException ? err.message : 'No se pudo guardar',
        });
      }
    }

    return results;
  }

  // ── STANDARD CRUD ────────────────────────────────────────────────────────────

  @Post()
  create(@Body() dto: CreateInventoryDto, @CurrentUser() user: AuthUser) {
    return this.inventoryService.create({
      ...dto,
      createdBy: user.id,
      updatedBy: user.id,
    });
  }

  @Get()
  findAll() {
    return this.inventoryService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryService.findOneOrFail(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInventoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.inventoryService.updateOrFail(id, {
      ...dto,
      updatedBy: user.id,
    });
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryService.remove(id);
  }
}
