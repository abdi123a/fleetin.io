import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { VerifyDocumentDto } from './dto/verify-document.dto';

interface FindAllParams {
  ownerType?: string;
  ownerId?: string;
  page: number;
  limit: number;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async findAll({ ownerType, ownerId, page, limit }: FindAllParams) {
    const where = {
      ...(ownerType ? { ownerType } : {}),
      ...(ownerId ? { ownerId } : {}),
    };
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.document.findMany({ where, skip, take: limit, orderBy: { uploadedAt: 'desc' } }),
      this.prisma.document.count({ where }),
    ]);

    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document) throw new NotFoundException(`Document with ID "${id}" not found`);
    return document;
  }

  async upload(dto: UploadDocumentDto, file: Express.Multer.File | undefined, uploadedById: string) {
    if (!file) throw new BadRequestException('No file provided (expected multipart field "file")');

    // `category` is deliberately an open string, not validated against the
    // DocumentType catalog — the frontend itself treats it that way
    // (PartnerDocumentCategory = string) across several independent upload
    // surfaces (the catalog-driven "New Transporter Onboarding" flow, and
    // PartnerDetailPage's own free-form category <Select>) that were never
    // reconciled to a single vocabulary even before this backend existed.
    // DocumentType exists to power the "one row per known type" upload UI,
    // not to gate every possible upload path.

    const stored = await this.storage.upload(
      { originalname: file.originalname, buffer: file.buffer, mimetype: file.mimetype, size: file.size },
      { folder: 'documents' },
    );

    return this.prisma.document.create({
      data: {
        ownerType: dto.ownerType,
        ownerId: dto.ownerId,
        category: dto.category,
        name: file.originalname,
        storageKey: stored.key,
        mimeType: stored.mimetype,
        fileSizeBytes: stored.size,
        status: 'Pending Review',
        uploadedById,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
      },
    });
  }

  async update(id: string, dto: UpdateDocumentDto) {
    await this.findOne(id);
    return this.prisma.document.update({
      where: { id },
      data: {
        category: dto.category,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
      },
    });
  }

  async verify(id: string, dto: VerifyDocumentDto, verifiedById: string) {
    await this.findOne(id);
    return this.prisma.document.update({
      where: { id },
      data: {
        status: dto.status,
        rejectionReason: dto.status === 'Rejected' ? dto.rejectionReason : null,
        verifiedById,
        verifiedAt: new Date(),
      },
    });
  }

  /** Reads the file back through StorageService and counts the download. */
  async download(id: string) {
    const document = await this.findOne(id);
    const buffer = await this.storage.get(document.storageKey);
    await this.prisma.document.update({ where: { id }, data: { downloadCount: { increment: 1 } } });
    return { buffer, document };
  }

  async remove(id: string) {
    const document = await this.findOne(id);
    await this.storage.delete(document.storageKey);
    return this.prisma.document.delete({ where: { id } });
  }
}
