import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateDriveFolderDto } from './dto/create-drive-folder.dto';
import { RenameDriveFolderDto } from './dto/rename-drive-folder.dto';
import { descendantsOf } from './drive-folders.util';

/**
 * The folders people make for themselves in Fleetin Drive.
 *
 * The rest of the drive is derived from records and closed; this half is
 * open. A folder is a name and a parent, nothing else — what it holds are
 * `Document` rows with `ownerType = FOLDER`, filed through the same upload as
 * every other paper in the system and read back the same way.
 */
@Injectable()
export class DriveFoldersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Every folder, flat.
   *
   * The tree is built by the reader, off one response, for the same reason the
   * compliance drive is: a folder that opens in 300ms out of data already in
   * memory beats a request per click. There is one row per folder somebody
   * chose to make, so the whole table is a short list.
   */
  async findAll() {
    const folders = await this.prisma.driveFolder.findMany({ orderBy: { name: 'asc' } });
    return { items: await this.withPeople(folders) };
  }

  async findOne(id: string) {
    const folder = await this.prisma.driveFolder.findUnique({ where: { id } });
    if (!folder) throw new NotFoundException(`Folder with ID "${id}" not found`);
    return folder;
  }

  async create(dto: CreateDriveFolderDto, createdById: string) {
    const name = cleanName(dto.name);
    const parentId = dto.parentId ?? null;
    /* A nested folder inherits its parent's owner rather than being told one:
       the owner is a property of the whole branch, and letting a caller send a
       different one is how a company's folder ends up holding somebody else's
       subtree. Only a root folder carries what it was sent. */
    const parent = parentId ? await this.findOne(parentId) : null;
    const ownerType = parent ? parent.ownerType : (dto.ownerType ?? null);
    const ownerId = parent ? parent.ownerId : (dto.ownerId ?? null);
    if ((ownerType === null) !== (ownerId === null)) {
      throw new BadRequestException('A folder owner needs both a type and an id.');
    }
    await this.assertNameFree(name, parentId, undefined, { ownerType, ownerId });

    return this.prisma.driveFolder.create({
      data: { name, parentId, ownerType, ownerId, createdById },
    });
  }

  async rename(id: string, dto: RenameDriveFolderDto) {
    const folder = await this.findOne(id);
    const name = cleanName(dto.name);
    await this.assertNameFree(name, folder.parentId, id, folder);

    return this.prisma.driveFolder.update({ where: { id }, data: { name } });
  }

  /**
   * The folder, every folder under it, and every file in any of them.
   *
   * Sub-folders go with the database's cascade. The files do not — a document
   * has no foreign key to anything, by design — so they are collected off the
   * subtree first and removed from storage and from the table before the
   * folder row goes. Storage first: a row pointing at a blob that is gone is a
   * broken download, but a blob with no row is only wasted disk.
   */
  async remove(id: string) {
    await this.findOne(id);

    const all = await this.prisma.driveFolder.findMany({ select: { id: true, parentId: true } });
    const ids = descendantsOf(id, all);
    const files = await this.prisma.document.findMany({
      where: { ownerType: 'FOLDER', ownerId: { in: ids } },
      select: { id: true, storageKey: true },
    });

    for (const file of files) {
      await this.storage.delete(file.storageKey);
    }
    if (files.length) {
      await this.prisma.document.deleteMany({ where: { id: { in: files.map((file) => file.id) } } });
    }
    await this.prisma.driveFolder.delete({ where: { id } });

    return { deleted: { folders: ids.length, files: files.length } };
  }

  /**
   * Two folders of one name in one place are one folder the reader cannot
   * tell apart, so the name has to be free among its siblings. Compared
   * case-insensitively here rather than left to the column's collation, so the
   * rule holds whatever the database is set to.
   */
  /* Scoped by owner as well as by parent. Two companies may both keep a
     "Contracts" folder at their own root, and at the root `parentId` is null
     for both — without the owner in the where-clause the second one is
     refused as a duplicate of the first. */
  private async assertNameFree(
    name: string,
    parentId: string | null,
    exceptId?: string,
    owner?: { ownerType: string | null; ownerId: string | null },
  ) {
    const siblings = await this.prisma.driveFolder.findMany({
      where: {
        parentId,
        ...(parentId ? {} : { ownerType: owner?.ownerType ?? null, ownerId: owner?.ownerId ?? null }),
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { name: true },
    });
    const wanted = name.toLowerCase();
    if (siblings.some((sibling) => sibling.name.toLowerCase() === wanted)) {
      throw new ConflictException(`A folder named "${name}" already exists here`);
    }
  }

  /** Who made it — resolved the way `DocumentsService.withPeople` does. */
  private async withPeople<T extends { createdById: string }>(
    folders: T[],
  ): Promise<(T & { createdByName: string | null })[]> {
    const ids = [...new Set(folders.map((folder) => folder.createdById))];
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const nameById = new Map(users.map((user) => [user.id, `${user.firstName} ${user.lastName}`.trim()]));
    return folders.map((folder) => ({ ...folder, createdByName: nameById.get(folder.createdById) ?? null }));
  }
}

/** Trimmed, with runs of whitespace collapsed; refused when nothing is left. */
function cleanName(raw: string): string {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (!name) throw new BadRequestException('A folder needs a name');
  return name;
}
