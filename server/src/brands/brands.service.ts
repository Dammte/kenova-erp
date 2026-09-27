import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from './entities/brand.entity';
import { ILike } from 'typeorm';

@Injectable()
export class BrandsService {
  constructor(
    @InjectRepository(Brand)
    private readonly brandRepository: Repository<Brand>,
  ) {}

  private toTitleCase(str: string): string {
    return str
      .trim()
      .toLowerCase()
      .replace(/(?:^|\s|-)\S/g, (c) => c.toUpperCase());
  }

  async create(createBrandDto: CreateBrandDto): Promise<Brand> {
    const dto = { ...createBrandDto };
    if (typeof dto.name === 'string') dto.name = this.toTitleCase(dto.name);
    const brand = this.brandRepository.create(dto);
    return await this.brandRepository.save(brand);
  }

  async findAll(): Promise<Brand[]> {
    return await this.brandRepository.find();
  }

  async findOne(id: string): Promise<Brand | null> {
    return await this.brandRepository.findOne({ where: { id } });
  }

  async findByName(name: string): Promise<Brand[]> {
    return this.brandRepository.find({
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
    updateBrandDto: Partial<UpdateBrandDto>,
  ): Promise<void> {
    const dto = { ...updateBrandDto };
    if (typeof dto.name === 'string') dto.name = this.toTitleCase(dto.name);
    await this.brandRepository.update(id, dto);
  }

  async remove(id: string): Promise<string> {
    const brand = await this.brandRepository.findOne({ where: { id } });
    if (!brand) {
      throw new NotFoundException('Marca no encontrada');
    }
    await this.brandRepository.delete(id);
    return `Brand with id ${id} deleted successfully`;
  }
}
