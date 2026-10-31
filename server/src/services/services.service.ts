import {
  Injectable,
  NotFoundException,
  BadRequestException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Service } from './entities/service.entity';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { foldSql, likeTerms } from '../common/text-search';

/** One row of the price list, as the counter screen shows it. */
export interface RateRow {
  id: string;
  name: string;
  category: string | null;
  price: string;
  estimatedTime: string | null;
  quality: Service['quality'];
  model: { id: string; name: string; brand: string | null } | null;
  /** Only for SUPER_ADMIN; null when hidden or when no part is linked. */
  stock: { units: number; low: boolean } | null;
}

/** Rows the search returns at most. */
const RATES_SHOWN = 50;

@Injectable()
export class ServicesService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(Service)
    private servicesRepository: Repository<Service>,
  ) {}

  async create(createServiceDto: CreateServiceDto): Promise<Service> {
    try {
      const newService = this.servicesRepository.create(createServiceDto);
      return await this.servicesRepository.save(newService);
    } catch (error) {
      throw new BadRequestException(
        'No se pudo crear el servicio. Por favor, verifica los datos.',
      );
    }
  }

  async findAll(): Promise<Service[]> {
    return this.servicesRepository.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findOne(id: string): Promise<Service> {
    const service = await this.servicesRepository.findOne({ where: { id } });

    if (!service) {
      throw new NotFoundException(`Servicio con ID ${id} no encontrado`);
    }

    return service;
  }

  async searchRates(query: string, withStock: boolean): Promise<RateRow[]> {
    const words = query
      .split(/\s+/)
      .map((w) => likeTerms(w, 1)?.term)
      .filter((w): w is string => Boolean(w))
      .slice(0, 6);
    if (words.length === 0) return [];
    const haystack = foldSql(
      `concat_ws(' ', s.name, s.category, m.name, b.name)`,
    );
    const qb = this.servicesRepository
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.model', 'm')
      .leftJoinAndSelect('m.brand', 'b')
      .leftJoinAndSelect('s.inventory', 'i', 'i.deletedAt IS NULL')
      .where('s.available = true');
    words.forEach((w, n) =>
      qb.andWhere(`${haystack} LIKE :w${n}`, { [`w${n}`]: w }),
    );
    const rows = await qb
      .orderBy('b.name', 'ASC', 'NULLS LAST')
      .addOrderBy('m.name', 'ASC', 'NULLS LAST')
      .addOrderBy('s.category', 'ASC', 'NULLS LAST')
      .addOrderBy('s.quality', 'ASC', 'NULLS FIRST')
      .addOrderBy('s.name', 'ASC')
      .limit(RATES_SHOWN)
      .getMany();

    return rows.map((s) => {
      const part = withStock ? s.inventory : null;
      const units = part ? (part.stock ?? 0) : 0;
      return {
        id: s.id,
        name: s.name,
        category: s.category ?? null,
        price: String(s.price),
        estimatedTime: s.estimatedTime ?? null,
        quality: s.quality,
        model: s.model
          ? {
              id: s.model.id,
              name: s.model.name,
              brand: s.model.brand?.name ?? null,
            }
          : null,
        stock: part
          ? {
              units,
              low: part.minimalStock != null && units <= part.minimalStock,
            }
          : null,
      };
    });
  }

  async findByName(name: string): Promise<Service[]> {
    return this.servicesRepository.find({
      where: {
        name: ILike(`%${name}%`),
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async update(
    id: string,
    updateServiceDto: UpdateServiceDto,
  ): Promise<Service> {
    const service = await this.findOne(id);

    try {
      Object.assign(service, updateServiceDto);
      return await this.servicesRepository.save(service);
    } catch (error) {
      throw new BadRequestException(
        'No se pudo actualizar el servicio. Por favor, verifica los datos.',
      );
    }
  }

  async remove(id: string): Promise<{ message: string }> {
    const service = await this.findOne(id);

    await this.servicesRepository.remove(service);
    return { message: `Servicio con ID ${id} eliminado correctamente` };
  }

  async findByCategory(category: string): Promise<Service[]> {
    return this.servicesRepository.find({
      where: { category },
      order: {
        name: 'ASC',
      },
    });
  }

  async findAvailable(): Promise<Service[]> {
    return this.servicesRepository.find({
      where: { available: true },
      order: {
        name: 'ASC',
      },
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    const exists = await this.servicesRepository.findOne({
      where: { name: 'Revisión' },
    });
    if (!exists) {
      await this.servicesRepository.save(
        this.servicesRepository.create({
          name: 'Revisión',
          description: 'Diagnóstico y revisión general del dispositivo',
          price: 20,
          estimatedTime: '1-2 días',
          category: 'Diagnóstico',
          available: true,
        }),
      );
    }
  }
}
