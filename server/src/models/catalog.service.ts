import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { Brand } from '../brands/entities/brand.entity';
import { normalizeProductName } from '../common/product-name';
import { Device } from '../devices/entities/device.entity';
import { Service } from '../services/entities/service.entity';
import { MergeModelsDto, UpdateCatalogModelDto } from './dto/catalog.dto';
import { Model, type ModelDeviceType } from './entities/model.entity';

/** GET /api/catalog/models: one row of «Marcas y modelos». */
export interface CatalogModel {
  id: string;
  name: string;
  brand: { id: string; name: string } | null;
  deviceType: ModelDeviceType | null;
  active: boolean;
  /** Devices whose brand and model read exactly like this one. */
  devices: number;
  /** Price list entries for this model. */
  rates: number;
  /** Other models of the same brand that read the same (see sameName). */
  duplicates: string[];
}

/**
 * Design R2 3.8: «iPhone 13», «iphone 13» and «I Phone 13» are the same
 * model. Capitals, accents and spaces are ignored.
 */
export function sameName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '');
}

/**
 * Design R2 3.8 «Catálogo» (partners only): the models with what uses them,
 * and the fixes the screen offers: rename, set the device type, withdraw and
 * merge duplicates. Devices keep brand and model as text, so a rename or a
 * merge rewrites the devices that read like the old name.
 */
@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Model) private readonly models: Repository<Model>,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<CatalogModel[]> {
    const models = await this.models.find({ relations: { brand: true } });
    const devices: { brand: string; model: string; n: string }[] =
      await this.models.manager
        .getRepository(Device)
        .createQueryBuilder('d')
        .select('d.brand', 'brand')
        .addSelect('d.model', 'model')
        .addSelect('COUNT(*)', 'n')
        .groupBy('d.brand')
        .addGroupBy('d.model')
        .getRawMany();
    const rates: { modelId: string; n: string }[] = await this.models.manager
      .getRepository(Service)
      .createQueryBuilder('s')
      .select('s.modelId', 'modelId')
      .addSelect('COUNT(*)', 'n')
      .where('s.modelId IS NOT NULL')
      .groupBy('s.modelId')
      .getRawMany();

    const deviceCount = new Map(
      devices.map((d) => [`${d.brand}\u0000${d.model}`, Number(d.n)]),
    );
    const rateCount = new Map(rates.map((r) => [r.modelId, Number(r.n)]));
    const groups = new Map<string, string[]>();
    const key = (m: Model) => `${m.brandId ?? ''}\u0000${sameName(m.name)}`;
    for (const m of models) {
      groups.set(key(m), [...(groups.get(key(m)) ?? []), m.id]);
    }

    return models
      .map((m) => ({
        id: m.id,
        name: m.name,
        brand: m.brand ? { id: m.brand.id, name: m.brand.name } : null,
        deviceType: m.deviceType,
        active: m.active,
        devices: m.brand
          ? (deviceCount.get(`${m.brand.name}\u0000${m.name}`) ?? 0)
          : 0,
        rates: rateCount.get(m.id) ?? 0,
        duplicates: (groups.get(key(m)) ?? []).filter((id) => id !== m.id),
      }))
      .sort(
        (a, b) =>
          (a.brand?.name ?? '').localeCompare(b.brand?.name ?? '', 'es') ||
          // Duplicates side by side: «iPhone 13» next to «iphone  13».
          sameName(a.name).localeCompare(sameName(b.name), 'es', {
            numeric: true,
          }) ||
          a.name.localeCompare(b.name, 'es'),
      );
  }

  async update(
    id: string,
    dto: UpdateCatalogModelDto,
    actorId: string,
  ): Promise<CatalogModel> {
    await this.models.manager.transaction(async (m) => {
      const model = await this.load(m, id);
      const before = {
        name: model.name,
        deviceType: model.deviceType,
        active: model.active,
      };
      if (dto.name !== undefined) {
        const name = normalizeProductName(dto.name);
        if (name !== model.name) {
          const twin = (
            await m.getRepository(Model).find({
              where: { brandId: model.brandId ?? undefined },
            })
          ).find((o) => o.id !== id && sameName(o.name) === sameName(name));
          if (twin) {
            throw new ConflictException(
              `Ya existe «${twin.name}» en ${model.brand?.name ?? 'esta marca'}: únelos en vez de renombrar.`,
            );
          }
          await this.moveDevices(m, model, name);
          model.name = name;
        }
      }
      if (dto.deviceType !== undefined) model.deviceType = dto.deviceType;
      if (dto.active !== undefined) model.active = dto.active;
      await m.getRepository(Model).save(model);
      await this.audit.record(
        {
          action: 'MODEL_UPDATED',
          actorUserId: actorId,
          entityType: 'model',
          entityId: id,
          metadata: {
            before,
            after: {
              name: model.name,
              deviceType: model.deviceType,
              active: model.active,
            },
          },
        },
        m,
      );
    });
    return this.row(id);
  }

  /**
   * Merges the duplicate `fromId` into `id`: its rates and devices move over
   * and the duplicate goes away. Refused when both have the same rate, so no
   * price is lost silently.
   */
  async merge(
    id: string,
    dto: MergeModelsDto,
    actorId: string,
  ): Promise<CatalogModel> {
    if (dto.fromId === id) {
      throw new BadRequestException('Elige otro modelo para unir');
    }
    await this.models.manager.transaction(async (m) => {
      const keep = await this.load(m, id);
      const from = await this.load(m, dto.fromId);
      if (keep.brandId !== from.brandId) {
        throw new BadRequestException('Solo se unen modelos de la misma marca');
      }
      const services = m.getRepository(Service);
      const rateKey = (s: Service) =>
        `${sameName(s.name)}\u0000${s.quality ?? ''}`;
      const kept = new Set(
        (await services.find({ where: { modelId: id, available: true } })).map(
          rateKey,
        ),
      );
      const clash = (
        await services.find({ where: { modelId: from.id, available: true } })
      ).find((s) => kept.has(rateKey(s)));
      if (clash) {
        throw new ConflictException(
          `No se ha podido unir: ${from.name} tiene la tarifa «${clash.name}», que ${keep.name} ya tiene. Retira una de las dos en Tarifas antes de unir.`,
        );
      }
      const rates = await services.update(
        { modelId: from.id },
        { modelId: id },
      );
      const devices = await this.moveDevices(m, from, keep.name);
      if (!keep.deviceType && from.deviceType) {
        keep.deviceType = from.deviceType;
        await m.getRepository(Model).save(keep);
      }
      await m.getRepository(Model).delete(from.id);
      await this.audit.record(
        {
          action: 'MODELS_MERGED',
          actorUserId: actorId,
          entityType: 'model',
          entityId: id,
          metadata: {
            from: { id: from.id, name: from.name },
            into: keep.name,
            rates: rates.affected ?? 0,
            devices,
          },
        },
        m,
      );
    });
    return this.row(id);
  }

  private async load(m: EntityManager, id: string): Promise<Model> {
    const model = await m.getRepository(Model).findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!model) throw new NotFoundException('Modelo no encontrado');
    model.brand = (
      model.brandId
        ? await m.getRepository(Brand).findOneBy({ id: model.brandId })
        : null
    ) as Brand;
    return model;
  }

  /** Rewrites the devices that read like `model` to the name `to`. */
  private async moveDevices(
    m: EntityManager,
    model: Model,
    to: string,
  ): Promise<number> {
    if (!model.brand) return 0;
    const res = await m
      .getRepository(Device)
      .update({ brand: model.brand.name, model: model.name }, { model: to });
    return res.affected ?? 0;
  }

  private async row(id: string): Promise<CatalogModel> {
    const row = (await this.list()).find((r) => r.id === id);
    if (!row) throw new NotFoundException('Modelo no encontrado');
    return row;
  }
}
