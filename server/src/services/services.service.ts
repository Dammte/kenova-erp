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
