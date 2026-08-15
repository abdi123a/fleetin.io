import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

/** The pinned primary key of the one settings row — see `AppSettings` in the schema. */
const SINGLETON = 'SINGLETON';

/**
 * Platform-wide configuration. Exactly one row, read by anything that needs a
 * house rule rather than a per-counterparty one — today that is Fleetin's
 * commission percentage, which every transporter is subject to equally.
 */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Reads the settings row, creating it with defaults the first time anyone asks. */
  async get() {
    return this.prisma.appSettings.upsert({
      where: { id: SINGLETON },
      update: {},
      create: { id: SINGLETON },
    });
  }

  async update(dto: UpdateSettingsDto, actorId: string, actorName: string) {
    await this.get();
    return this.prisma.appSettings.update({
      where: { id: SINGLETON },
      data: {
        fleetinCommissionPct: dto.fleetinCommissionPct,
        updatedById: actorId,
        updatedByName: actorName,
      },
    });
  }
}
