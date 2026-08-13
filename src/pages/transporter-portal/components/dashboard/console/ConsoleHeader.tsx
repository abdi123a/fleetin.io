import { Download, Moon, Sparkles, Sun, Sunrise } from 'lucide-react';
import { ExternalLink } from '@/design-system/icons';
import { TimeframePicker } from '@/pages/shippers/components/dashboard/TimeframePicker';
import type { DatePreset as ShipperDatePreset } from '@/features/shipper-bi/contracts';
import type { DatePreset } from '@/features/transporter-bi/contracts';
import { cn } from '@/utils';
import { IconChip } from '@/design-system';

/**
 * The console's opening line: who is looking, what is on fire, what window.
 *
 * Same construction as the shipper dashboard header — greeting, alert pills,
 * timeframe, export — because the two portals are the same product seen from
 * opposite ends of the same move, and a transporter who has also used the
 * shipper side should not have to relearn the top of the page.
 *
 * The pills are the difference. A shipper's opening alert is a container they
 * are waiting on; a transporter's is a clock running against their own money,
 * so there are two of them and the first one is red.
 */

export interface ConsoleHeaderProps {
  userName: string;
  greeting: string;
  companyName?: string;
  /** Containers on a detention clock that is overdue or expires today. */
  detentionRunning: number;
  /** Trucks running home empty with no return load booked. */
  emptyOverdue: number;
  preset: DatePreset;
  from: string;
  to: string;
  onTimeframeChange: (preset: DatePreset) => void;
  onCustomRangeChange?: (from: string, to: string) => void;
  onExportCsv?: () => void;
  onDetentionClick?: () => void;
  onEmptyReturnClick?: () => void;
}

export function ConsoleHeader({
  userName,
  greeting,
  companyName,
  detentionRunning,
  emptyOverdue,
  preset,
  from,
  to,
  onTimeframeChange,
  onCustomRangeChange,
  onExportCsv,
  onDetentionClick,
  onEmptyReturnClick,
}: ConsoleHeaderProps) {
  const greetingIcon = (() => {
    const lower = greeting.toLowerCase();
    if (lower.includes('morning')) return <Sunrise className="h-4 w-4 shrink-0 text-warning-subtle-foreground" />;
    if (lower.includes('afternoon')) return <Sun className="h-4 w-4 shrink-0 text-warning-subtle-foreground" />;
    if (lower.includes('evening') || lower.includes('night'))
      return <Moon className="h-4 w-4 shrink-0 text-info-subtle-foreground" />;
    return <Sparkles className="h-4 w-4 shrink-0 text-primary" />;
  })();

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <span>
            Hi <span className="font-semibold text-foreground">{userName}</span>, welcome back!
          </span>{' '}
          👋
        </p>

        <h1 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          <span>{greeting}</span>
          <IconChip>{greetingIcon}</IconChip>
        </h1>

        {companyName ? (
          <p className="type-body-xs text-muted-foreground">{companyName} · Fleet console</p>
        ) : null}

        {detentionRunning > 0 || emptyOverdue > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {detentionRunning > 0 ? (
              <AlertPill
                tone="critical"
                onClick={onDetentionClick}
                label={`${detentionRunning} Detention Clock${detentionRunning === 1 ? '' : 's'} Running`}
              />
            ) : null}
            {emptyOverdue > 0 ? (
              <AlertPill
                tone="attention"
                onClick={onEmptyReturnClick}
                label={`${emptyOverdue} Empty Return${emptyOverdue === 1 ? '' : 's'} Unbooked`}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3 sm:flex-nowrap">
        <TimeframePicker
          preset={preset as ShipperDatePreset}
          from={from}
          to={to}
          onChange={(next) => onTimeframeChange(next as DatePreset)}
          onCustomChange={onCustomRangeChange}
        />

        <button
          type="button"
          onClick={onExportCsv}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-sunken"
        >
          <Download className="h-3.5 w-3.5 text-muted-foreground" />
          <span>Export CSV</span>
        </button>
      </div>
    </div>
  );
}

function AlertPill({
  label,
  tone,
  onClick,
}: {
  label: string;
  tone: 'critical' | 'attention';
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold shadow-2xs transition active:scale-95',
        tone === 'critical'
          ? 'border border-destructive/40 bg-destructive-subtle text-destructive-subtle-foreground hover:border-destructive/60 hover:bg-destructive/20'
          : 'border border-accent/45 bg-accent-subtle text-accent-subtle-foreground hover:bg-accent/20',
      )}
    >
      <span className="relative flex size-2 shrink-0" aria-hidden>
        <span
          className={cn(
            'absolute inline-flex h-full w-full animate-ping motion-reduce:animate-none rounded-full opacity-75',
            tone === 'critical' ? 'bg-destructive' : 'bg-accent',
          )}
        />
        <span
          className={cn(
            'relative inline-flex size-2 rounded-full',
            tone === 'critical' ? 'bg-destructive' : 'bg-accent',
          )}
        />
      </span>
      <span className="tracking-tight">{label}</span>
      <ExternalLink className="size-3 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </button>
  );
}

export default ConsoleHeader;
