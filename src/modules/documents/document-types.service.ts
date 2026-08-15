import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';

@Injectable()
export class DocumentTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(ownerType?: string) {
    return this.prisma.documentType.findMany({
      where: ownerType ? { ownerType } : {},
      orderBy: { label: 'asc' },
    });
  }

  async create(dto: CreateDocumentTypeDto) {
    const existing = await this.prisma.documentType.findUnique({
      where: { ownerType_label: { ownerType: dto.ownerType, label: dto.label } },
    });
    if (existing) {
      throw new ConflictException(`Document type "${dto.label}" already exists for ${dto.ownerType}`);
    }
    return this.prisma.documentType.create({
      data: { ownerType: dto.ownerType, label: dto.label, required: dto.required ?? false },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.documentType.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Document type with ID "${id}" not found`);
    return this.prisma.documentType.delete({ where: { id } });
  }
}
