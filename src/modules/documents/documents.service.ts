import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { VerifyDocumentDto } from './dto/verify-document.dto';
import { BOOKING_PROOFS } from './document-owner-type';
import { decodeMulterFilename } from '../../common/helpers/multipart-filename.util';

/** A booking whose record is settled — see `remove` below. */
const CLOSED_BOOKING_STATUSES = ['Completed', 'Cancelled', 'Failed'];

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

    return {
      items: await this.withPeople(items),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document) throw new NotFoundException(`Document with ID "${id}" not found`);
    const [withPerson] = await this.withPeople([document]);
    return withPerson;
  }

  /**
   * Who filed it, and who checked it.
   *
   * `uploadedById` and `verifiedById` are plain columns — a Document has no
   * relation to User, deliberately, since a document outlives the account that
   * uploaded it and must not be deleted with one. So the names are resolved
   * here, in one query for the whole page rather than one per row, and folded
   * onto the response.
   *
   * An id with no user behind it (a deleted account, a seeded row) reports
   * `null` rather than the raw uuid: a name nobody can read is worse than no
   * name, because it looks like data.
   */
  private async withPeople<T extends { uploadedById: string; verifiedById: string | null }>(
    documents: T[],
  ): Promise<(T & { uploadedByName: string | null; verifiedByName: string | null })[]> {
    const ids = [
      ...new Set(
        documents.flatMap((doc) => [doc.uploadedById, doc.verifiedById]).filter((id): id is string => Boolean(id)),
      ),
    ];
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const nameById = new Map(users.map((user) => [user.id, `${user.firstName} ${user.lastName}`.trim()]));

    return documents.map((doc) => ({
      ...doc,
      uploadedByName: nameById.get(doc.uploadedById) ?? null,
      verifiedByName: doc.verifiedById ? (nameById.get(doc.verifiedById) ?? null) : null,
    }));
  }

  async upload(dto: UploadDocumentDto, file: Express.Multer.File | undefined, uploadedById: string) {
    if (!file) throw new BadRequestException('No file provided (expected multipart field "file")');

    /* A file in the Files section belongs to a folder somebody made, and a
       folder that is gone (deleted from another tab a moment ago) must not
       quietly collect files nothing can list. The other owner types are
       records with pages of their own and are checked by the pages. */
    if (dto.ownerType === 'FOLDER') {
      const folder = await this.prisma.driveFolder.findUnique({ where: { id: dto.ownerId }, select: { id: true } });
      if (!folder) throw new NotFoundException(`Folder with ID "${dto.ownerId}" not found`);
    }

    // `category` is deliberately an open string, not validated against the
    // DocumentType catalog — the frontend itself treats it that way
    // (PartnerDocumentCategory = string) across several independent upload
    // surfaces (the catalog-driven "New Transporter Onboarding" flow, and
    // PartnerDetailPage's own free-form category <Select>) that were never
    // reconciled to a single vocabulary even before this backend existed.
    // DocumentType exists to power the "one row per known type" upload UI,
    // not to gate every possible upload path.

    /* Multer hands `originalname` back as latin1-decoded bytes, so anything
     * outside ASCII arrives mangled — a macOS screenshot is named with a
     * narrow no-break space (U+202F) and came through as
     * "Screenshot 2026-08-31 at 1.42.57âÄ¯PM.png". The bytes are right; only
     * the decoding was wrong, so re-read them as UTF-8. Left alone when that
     * round-trip is lossy, which is what a genuinely latin1 name looks like. */
    const originalname = decodeMulterFilename(file.originalname);

    const stored = await this.storage.upload(
      { originalname, buffer: file.buffer, mimetype: file.mimetype, size: file.size },
      { folder: 'documents' },
    );

    const created = await this.prisma.document.create({
      data: {
        ownerType: dto.ownerType,
        ownerId: dto.ownerId,
        category: dto.category,
        name: originalname,
        storageKey: stored.key,
        mimeType: stored.mimetype,
        fileSizeBytes: stored.size,
        status: 'Pending Review',
        uploadedById,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        issuer: dto.issuer?.trim() || undefined,
      },
    });

    await this.syncVehicleComplianceDates(created);
    return created;
  }

  /**
   * A truck's compliance dates come FROM its papers.
   *
   * `Vehicle.registrationExpiry` and the three insurance columns existed before
   * documents did, and were typed by hand on the vehicle form — so a truck
   * could carry an insurance certificate expiring in March and a column saying
   * it was covered until December, with nothing reconciling the two. Every
   * verification check in the app reads the columns (`isVehicleVerified`,
   * the compliance alerts, the fleet list), so the columns have to be the
   * paper's own facts rather than a second opinion about them.
   *
   * The document is therefore the source and this is the write-through, run on
   * every vehicle upload. Silent when the upload carries no dates: an
   * undated certificate should not blank out what the vehicle already knew.
   */
  private async syncVehicleComplianceDates(document: {
    ownerType: string;
    ownerId: string;
    category: string;
    issueDate: Date | null;
    expiryDate: Date | null;
    issuer: string | null;
  }) {
    if (document.ownerType !== 'VEHICLE') return;

    if (document.category === 'Insurance') {
      await this.prisma.vehicle.updateMany({
        where: { id: document.ownerId },
        data: {
          ...(document.issuer ? { insuranceProvider: document.issuer } : {}),
          ...(document.issueDate ? { insuranceStartDate: document.issueDate } : {}),
          ...(document.expiryDate ? { insuranceExpiry: document.expiryDate } : {}),
        },
      });
      return;
    }

    /* The grey card IS the registration, so its expiry is the registration's. */
    if (document.category === 'Grey Card' && document.expiryDate) {
      await this.prisma.vehicle.updateMany({
        where: { id: document.ownerId },
        data: { registrationExpiry: document.expiryDate },
      });
    }
  }

  async update(id: string, dto: UpdateDocumentDto) {
    await this.findOne(id);
    const updated = await this.prisma.document.update({
      where: { id },
      data: {
        category: dto.category,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        issuer: dto.issuer?.trim() || undefined,
      },
    });

    /* Correcting a certificate's expiry has to move the truck's cover with it,
       or the correction is only half made. */
    await this.syncVehicleComplianceDates(updated);
    return updated;
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

  /**
   * Reads the file back through StorageService, and records who took a copy.
   *
   * The counter used to be the whole record — an integer that answered "how
   * popular is this file", which is not a question anybody asks about an
   * insurance certificate. Who pulled a copy of a haulier's trading licence is
   * an audit fact, so it is written as a row with a name and a time on it.
   *
   * The counter is still incremented. It is the only trace of the downloads
   * that happened before the log existed, and the reader is told when the two
   * disagree rather than having the older number quietly discarded.
   */
  async download(id: string, userId?: string) {
    const document = await this.findOne(id);
    const buffer = await this.storage.get(document.storageKey);
    await this.prisma.document.update({ where: { id }, data: { downloadCount: { increment: 1 } } });
    if (userId) {
      await this.prisma.documentDownload.create({ data: { documentId: id, userId } });
    }
    return { buffer, document };
  }

  /**
   * Who has taken a copy, newest first.
   *
   * Capped at fifty: this is read inside a panel to answer "who has seen this",
   * and a document downloaded hundreds of times is answering that with its most
   * recent readers. `total` is the logged count, which the caller compares
   * against `downloadCount` to say how many predate the log.
   */
  async downloads(id: string, limit = 50) {
    await this.findOne(id);
    const [rows, total] = await Promise.all([
      this.prisma.documentDownload.findMany({
        where: { documentId: id },
        orderBy: { at: 'desc' },
        take: limit,
      }),
      this.prisma.documentDownload.count({ where: { documentId: id } }),
    ]);

    const users = rows.length
      ? await this.prisma.user.findMany({
          where: { id: { in: [...new Set(rows.map((row) => row.userId))] } },
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        })
      : [];
    const byId = new Map(users.map((user) => [user.id, user]));

    return {
      items: rows.map((row) => {
        const user = byId.get(row.userId);
        return {
          id: row.id,
          at: row.at,
          userId: row.userId,
          /* Null rather than the uuid for an account that is gone: a name
             nobody can read looks like data. */
          name: user ? `${user.firstName} ${user.lastName}`.trim() : null,
          avatarUrl: user?.avatarUrl ?? null,
        };
      }),
      total,
    };
  }

  async remove(id: string) {
    const document = await this.findOne(id);

    /**
     * A closed job's proofs are not deletable.
     *
     * They are the evidence the booking was closed on — the delivery note that
     * let its container start home and its payout be released, and the depot
     * receipt that ended the job — so removing either after the fact would
     * leave the record asserting events with nothing behind them. While the job
     * is still running they are ordinary working paperwork and can be
     * corrected freely.
     */
    if (document.ownerType === 'BOOKING' && BOOKING_PROOFS.includes(document.category as never)) {
      const booking = await this.prisma.booking.findUnique({
        where: { id: document.ownerId },
        select: { reference: true, status: true },
      });
      if (booking && CLOSED_BOOKING_STATUSES.includes(booking.status)) {
        throw new ConflictException(
          `Booking "${booking.reference}" is ${booking.status.toLowerCase()} — its proof of delivery is part of the closed record and cannot be removed.`,
        );
      }
    }

    await this.storage.delete(document.storageKey);
    return this.prisma.document.delete({ where: { id } });
  }
}
