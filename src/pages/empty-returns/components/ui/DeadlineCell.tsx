import { Clock } from '@/design-system/icons';
import { Tooltip } from '@/design-system';
import { formatDuration } from '@/stores/emptyReturn.store';
import type { ReturnRiskLevel } from '@/types/emptyReturn';
import { cn } from '@/utils';

import { URGENCY_TOKENS } from './urgencyTokens';

export interface DeadlineCellProps {
  deadline: number | null;
  slack: number | null;
  risk: ReturnRiskLevel | null;
  className?: string;
}

const CRITICAL_OR_WORSE: ReadonlySet<ReturnRiskLevel> = new Set([
  'overdue',
  'at_risk',
  'critical',
]);

function formatAbsolute(ts: number): string {
  const date = new Date(ts);
  const day = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day}, ${time}`;
}

function formatFullTimestamp(ts: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(ts));
}

/**
 * Clean, scannable deadline presentation:
 * - Relative delta (slack time) highlighted in semantic colors
 * - Formatted date/time sublabel
 */
export function DeadlineCell({ deadline, slack, risk, className }: DeadlineCellProps) {
  const delta = formatDuration(slack);
  const isLate = (slack ?? 0) < 0;
  const isOverdue = risk === 'overdue';
  const escalate = risk != null && CRITICAL_OR_WORSE.has(risk);

  const deltaColorClass =
    slack == null
      ? 'text-muted-foreground'
      : isOverdue
        ? 'text-destructive font-bold'
        : isLate || escalate
          ? risk
            ? URGENCY_TOKENS[risk].fg
            : 'text-destructive'
          : 'text-foreground';

  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5 tabular-nums', className)}>
      <div className="flex items-center gap-1">
        {slack !== null && (
          <span className={cn('text-xs font-semibold tracking-tight', deltaColorClass)}>
            {delta}
          </span>
        )}
        {slack === null && !deadline && (
          <span className="text-xs text-muted-foreground">No deadline</span>
        )}
      </div>

      {deadline ? (
        <Tooltip content={formatFullTimestamp(deadline)}>
          <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <Clock className="size-2.5 shrink-0 opacity-70" aria-hidden />
            {formatAbsolute(deadline)}
          </span>
        </Tooltip>
      ) : (
        <span className="text-[11px] text-muted-foreground/60">—</span>
      )}
    </div>
  );
}

