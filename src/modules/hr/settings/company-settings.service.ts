import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HrAuditService } from '../hr-audit.service';
import type { AuthenticatedUser } from '../../auth/jwt.strategy';

/**
 * The company identity every generated document prints.
 *
 * A single row, deliberately. The source workbook kept its company name in
 * the sheets themselves, which is how its leave planner ended up carrying a
 * different company's name than the rest of the file.
 */
@Injectable()
export class CompanySettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: HrAuditService,
  ) {}

  async get() {
    const settings = await this.prisma.companySettings.findFirst();
    if (!settings) {
      throw new NotFoundException(
        'Company settings have not been configured. No document can be generated until they exist.',
      );
    }
    return settings;
  }

  async update(user: AuthenticatedUser, data: Prisma.CompanySettingsUpdateInput) {
    const existing = await this.get();
    const updated = await this.prisma.companySettings.update({
      where: { id: existing.id },
      data,
    });

    await this.audit.record(user, {
      entity: 'CompanySettings',
      entityId: existing.id,
      action: 'update',
      detail: { changed: Object.keys(data) },
    });

    return updated;
  }
}
