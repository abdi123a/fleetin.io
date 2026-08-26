import { Link } from 'react-router-dom';

import { CheckCircle2 } from '@/design-system/icons';
import {
  ConsolePanel,
  StatusChip,
} from '@/pages/transporter-portal/components/dashboard/console/kit';
import { cn } from '@/utils';

import type { AttentionItem } from '../model';

/**
 * Everything in a section currently asking for a decision, ranked by what it
 * costs to ignore rather than by which module raised it.
 *
 * A row is red only when a rule is already broken — a deadline passed, a paper
 * expired, money past its contract date. Everything else is orange: it becomes
 * one of those if nobody moves. That is the only distinction an administrator
 * scanning this at 07:00 has to make, so it is the only one the row encodes.
 */
export function AttentionQueueCard({
  items,
  title = 'Action Required',
  clearMessage = 'All clear',
  emptyNote = 'No overdue deadline, hold or expiring document.',
  className,
}: {
  items: AttentionItem[];
  title?: string;
  clearMessage?: string;
  emptyNote?: string;
  className?: string;
}) {
  const breaches = items.filter((item) => item.severity === 'breach');

  return (
    <ConsolePanel
      className={className}
      title={title}
      subtitle={
        items.length === 0
          ? clearMessage
          : `${items.length} open · most urgent first`
      }
      action={
        breaches.length > 0 ? (
          <StatusChip tone="critical" pulse>
            {breaches.length} overdue
          </StatusChip>
        ) : (
          <StatusChip tone="calm">None overdue</StatusChip>
        )
      }
      bodyClassName="gap-2"
    >
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <CheckCircle2 aria-hidden className="size-8 text-primary" />
          <p className="text-sm font-bold text-foreground">Nothing pending</p>
          <p className="type-body-xs max-w-xs text-muted-foreground">{emptyNote}</p>
        </div>
      ) : (
        items.map((item) => (
          <Link
            key={item.id}
            to={item.to}
            className={cn(
              'group flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card-nested border px-3.5 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              item.severity === 'breach'
                ? 'border-destructive/35 bg-destructive-subtle hover:border-destructive/60'
                : 'border-accent/30 bg-accent-subtle hover:border-accent/60',
            )}
          >
            <span
              className={cn(
                'inline-flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold tabular-nums',
                item.severity === 'breach'
                  ? 'bg-destructive text-destructive-foreground'
                  : 'bg-accent-bold text-accent-bold-foreground',
              )}
            >
              {item.count}
            </span>

            <span className="min-w-[11rem] flex-1">
              <span className="block text-sm font-bold leading-snug text-foreground">{item.title}</span>
              <span className="type-body-xs mt-0.5 block leading-snug text-muted-foreground">{item.detail}</span>
            </span>

            <span className="type-body-xs shrink-0 rounded-full bg-surface px-2.5 py-1 font-bold text-muted-foreground">
              {item.module}
            </span>
          </Link>
        ))
      )}
    </ConsolePanel>
  );
}
