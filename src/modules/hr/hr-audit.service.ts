import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

export type HrAuditAction =
  | 'view'
  | 'list'
  | 'create'
  | 'update'
  | 'delete'
  | 'upload'
  | 'download'
  | 'calculate'
  | 'approve'
  | 'pay'
  | 'issue';

export interface HrAuditEntry {
  entity: string;
  entityId: string;
  action: HrAuditAction;
  detail?: Prisma.InputJsonValue;
  ipAddress?: string;
}

/**
 * Append-only trail over the HR module.
 *
 * §6 requires every *view* to be logged, not only every write, because the
 * sensitive act in an HR system is usually reading — a colleague's salary, a
 * passport scan. Reads are logged on the same path as writes for that reason.
 *
 * Failures are swallowed and logged. An audit sink that is briefly unwritable
 * must not take payroll down with it; a dropped row is visible in the logs and
 * is a smaller problem than a failed filing.
 */
@Injectable()
export class HrAuditService {
  private readonly logger = new Logger(HrAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(actor: AuthenticatedUser, entry: HrAuditEntry): Promise<void> {
    try {
      await this.prisma.hrAuditLog.create({
        data: {
          actorId: actor.id,
          actorName: `${actor.firstName} ${actor.lastName}`.trim() || actor.email,
          entity: entry.entity,
          entityId: entry.entityId,
          action: entry.action,
          detail: entry.detail,
          ipAddress: entry.ipAddress,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write HR audit entry (${entry.action} ${entry.entity}/${entry.entityId})`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** One call per record touched, so a bulk read is not one opaque line. */
  async recordMany(actor: AuthenticatedUser, entries: HrAuditEntry[]): Promise<void> {
    await Promise.all(entries.map((entry) => this.record(actor, entry)));
  }

  async trail(entity: string, entityId: string, limit = 100) {
    return this.prisma.hrAuditLog.findMany({
      where: { entity, entityId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
