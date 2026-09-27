import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateModelDto } from './dto/create-model.dto';
import { UpdateModelDto } from './dto/update-model.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Model } from './entities/model.entity';

@Injectable()
export class ModelsService {
  constructor(
    @InjectRepository(Model)
    private readonly modelRepository: Repository<Model>,
  ) {}

  private toTitleCase(str: string): string {
    return str
      .trim()
      .toLowerCase()
      .replace(/(?:^|\s|-)\S/g, (c) => c.toUpperCase());
  }

  async create(createModelDto: CreateModelDto): Promise<Model> {
    const dto = { ...createModelDto };
    if (typeof dto.name === 'string') dto.name = this.toTitleCase(dto.name);
    const model = this.modelRepository.create(dto);
    return this.modelRepository.save(model);
  }

  async findAll(): Promise<Model[]> {
    return this.modelRepository.find();
  }

  async findOne(id: string): Promise<Model | null> {
    const model = await this.modelRepository.findOne({ where: { id } });
    if (!model) {
      throw new NotFoundException('Modelo no encontrado');
    }
    return model;
  }

  async update(
    id: string,
    updateModelDto: Partial<UpdateModelDto>,
  ): Promise<void> {
    const dto = { ...updateModelDto };
    if (typeof dto.name === 'string') dto.name = this.toTitleCase(dto.name);
    await this.modelRepository.update(id, dto);
  }

  async remove(id: string): Promise<string> {
    const model = await this.modelRepository.findOne({ where: { id } });
    if (!model) {
      throw new NotFoundException('Modelo no encontrado');
    }
    await this.modelRepository.delete(id);
    return `Model with id ${id} deleted successfully`;
  }
}
