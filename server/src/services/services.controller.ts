import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Service } from './entities/service.entity';

@ApiTags('services')
@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo servicio' })
  @ApiResponse({
    status: 201,
    description: 'Servicio creado exitosamente',
    type: Service,
  })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  create(@Body() createServiceDto: CreateServiceDto) {
    return this.servicesService.create(createServiceDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todos los servicios' })
  @ApiResponse({
    status: 200,
    description: 'Lista de servicios',
    type: [Service],
  })
  @ApiQuery({
    name: 'category',
    required: false,
    description: 'Filtrar por categoría',
  })
  @ApiQuery({
    name: 'available',
    required: false,
    description: 'Filtrar por disponibilidad (true/false)',
  })
  findAll(
    @Query('category') category?: string,
    @Query('available') available?: string,
  ) {
    if (category) {
      return this.servicesService.findByCategory(category);
    }

    if (available === 'true') {
      return this.servicesService.findAvailable();
    }

    return this.servicesService.findAll();
  }

  @Get('name/:name')
  @ApiOperation({ summary: 'Obtener un servicio por nombre' })
  @ApiResponse({
    status: 200,
    description: 'Servicio encontrado',
    type: Service,
  })
  @ApiResponse({ status: 404, description: 'Servicio no encontrado' })
  @ApiParam({ name: 'name', description: 'Nombre del servicio' })
  findByName(@Param('name') name: string) {
    return this.servicesService.findByName(name);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un servicio por ID' })
  @ApiResponse({
    status: 200,
    description: 'Servicio encontrado',
    type: Service,
  })
  @ApiResponse({ status: 404, description: 'Servicio no encontrado' })
  @ApiParam({ name: 'id', description: 'ID del servicio' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.servicesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un servicio' })
  @ApiResponse({
    status: 200,
    description: 'Servicio actualizado',
    type: Service,
  })
  @ApiResponse({ status: 404, description: 'Servicio no encontrado' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiParam({ name: 'id', description: 'ID del servicio' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() updateServiceDto: UpdateServiceDto) {
    return this.servicesService.update(id, updateServiceDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un servicio' })
  @ApiResponse({ status: 200, description: 'Servicio eliminado exitosamente' })
  @ApiResponse({ status: 404, description: 'Servicio no encontrado' })
  @ApiParam({ name: 'id', description: 'ID del servicio' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.servicesService.remove(id);
  }
}
