import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { WorkspaceTaskEventKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProductivityService } from './productivity.service';
import { resolveDueOccurrence, toDay } from './recurrence.util';

export const WORKSPACE_RECURRENCE_QUEUE = 'workspace-recurrence';

/**
 * Mints the tasks that recurring rules are due to produce.
 *
 * The first background job this application runs. `QueueModule` already
 * establishes the Redis connection, the retry policy and the finished-job
 * window; this only declares the queue and the work.
 *
 * ## Why it cannot double up
 *
 * Every generated task gets a `WorkspaceTaskOccurrence` row keyed
 * `(recurrenceId, occurrenceOn)` with a unique index. Generation inserts that
 * row **inside the same transaction as the task**, so the second attempt at
 * the same occurrence dies on the index and rolls the task back with it.
 *
 * That ordering is the whole design. Checking "does a task already exist?"
 * first and writing second leaves a window where two workers both check, both
 * see nothing, and both write — which is exactly what happens the first time
 * a retry overlaps a scheduled run. Letting the database refuse it has no
 * window at all.
 *
 * The plan is explicit that comparing titles is not good enough, and it is
 * right: two people can raise "Review vehicle documents" on the same morning
 * without either of them being this rule.
 */
@Injectable()
@Processor(WORKSPACE_RECURRENCE_QUEUE)
export class WorkspaceRecurrenceProcessor extends WorkerHost {
  private readonly logger = new Logger(WorkspaceRecurrenceProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly productivity: ProductivityService,
  ) {
    super();
  }

  async process(): Promise<{ generated: number; skipped: number }> {
    return this.runDueRules();
  }

  /**
   * Generate for every rule that is due. Public so a person can trigger a
   * catch-up from the UI without waiting for the hour to turn.
   */
  async runDueRules(): Promise<{ generated: number; skipped: number }> {
    const today = toDay(new Date());
    const due = await this.prisma.workspaceTaskRecurrence.findMany({
      where: { enabled: true, nextRunOn: { lte: today } },
      include: { template: { include: { items: { orderBy: { position: 'asc' } } } } },
    });

    let generated = 0;
    let skipped = 0;

    for (const rule of due) {
      try {
        const resolved = resolveDueOccurrence(rule, rule.nextRunOn, today);
        if (!resolved) continue;

        const task = await this.productivity.createTaskFrom({
          title: rule.title,
          description: rule.description,
          priority: rule.priority,
          assigneeId: rule.assigneeId,
          /* Due on the occurrence day itself — a weekly review is for that
             week, not a week after it was minted. */
          dueInDays: Math.max(
            0,
            Math.round((resolved.occurrenceOn.getTime() - today.getTime()) / 86_400_000),
          ),
          /* The rule's author owns what the rule produces. A task with no
             creator would break the `Restrict` on `createdById`. */
          createdById: rule.createdById ?? (await this.anyInternalUserId()),
          checklist: rule.template?.items.map((i) => i.text),
          event: { kind: WorkspaceTaskEventKind.RECURRENCE_GENERATED, actorId: null, toValue: rule.title },
        });

        try {
          /* The guard. If this throws on the unique index the occurrence was
             already generated — by another worker, or by a retry of this same
             job — so the task we just made is surplus and goes away again. */
          await this.prisma.workspaceTaskOccurrence.create({
            data: {
              recurrenceId: rule.id,
              occurrenceOn: resolved.occurrenceOn,
              taskId: task.id,
            },
          });
        } catch {
          await this.prisma.workspaceTask.delete({ where: { id: task.id } });
          skipped += 1;
          continue;
        }

        await this.prisma.workspaceTaskRecurrence.update({
          where: { id: rule.id },
          data: { nextRunOn: resolved.nextRunOn, lastRunOn: resolved.occurrenceOn },
        });
        generated += 1;
      } catch (error) {
        /* One broken rule must not stop the others. BullMQ's own retry policy
           picks the job up again; the log is what makes a persistently failing
           rule visible rather than silent. */
        this.logger.error(
          `Recurrence "${rule.title}" (${rule.id}) failed to generate: ${(error as Error).message}`,
        );
        skipped += 1;
      }
    }

    if (generated || skipped) {
      this.logger.log(`Recurrence run: ${generated} generated, ${skipped} skipped`);
    }
    return { generated, skipped };
  }

  /** Last resort when a rule has outlived the account that made it. */
  private async anyInternalUserId(): Promise<string> {
    const user = await this.prisma.user.findFirstOrThrow({
      where: {
        status: 'ACTIVE', shipperId: null, partnerId: null,
        role: { name: { notIn: ['SHIPPER', 'TRANSPORTER'] } },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return user.id;
  }
}
