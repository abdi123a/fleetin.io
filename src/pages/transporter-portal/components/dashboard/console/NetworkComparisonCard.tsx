import { ConsolePanel, InsightNote, Legend, Meter, PanelLink, SectionLabel, SegmentBar } from './kit';
import { cn } from '@/utils';
import type { NetworkComparison } from './model';
import { hours as formatHours, pct } from './money';

/**
 * The same four numbers the network sees when it decides who to offer work to.
 *
 * Every row carries the network's tick, because a rate without its benchmark
 * is a number the reader has no way to feel. Teal where we are ahead, amber
 * where we are behind — the colour is the verdict, so the panel can be read in
 * one pass and only the amber rows need thinking about.
 *
 * The strip at the foot answers the obvious follow-up: of the hours lost, how
 * many were actually ours.
 */

export interface NetworkComparisonCardProps {
  data: NetworkComparison;
  onOpenDetails?: () => void;
  className?: string;
}

export function NetworkComparisonCard({
  data,
  onOpenDetails,
  className,
}: NetworkComparisonCardProps) {
  return (
    <ConsolePanel
      className={className}
      title="Performance vs Network"
      subtitle="Fleetin network · Djibouti corridor"
      action={onOpenDetails ? <PanelLink onClick={onOpenDetails}>Details</PanelLink> : undefined}
    >
      <div className="flex flex-col gap-4">
        {data.rows.map((row) => (
          <div key={row.key}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="type-body-xs min-w-0 truncate text-foreground">
                {row.label}
              </span>
              <span
                className={cn(
                  'type-body-xs shrink-0 font-bold tabular-nums',
                  row.ahead ? 'text-foreground' : 'text-accent-subtle-foreground',
                )}
              >
                {row.valueLabel}{' '}
                <span className="font-medium text-muted-foreground">vs {row.networkLabel}</span>
              </span>
            </div>
            <Meter
              value={row.value}
              benchmark={row.network}
              color={row.ahead ? 'var(--fl-teal-700)' : 'var(--accent-bold)'}
            />
          </div>
        ))}
      </div>

      <InsightNote className="mt-5">{data.insight}</InsightNote>

      <div className="mt-5 border-t border-border-subtle pt-4">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <SectionLabel>{formatHours(data.hoursLost, 0)} lost — root cause</SectionLabel>
          <span className="type-body-xs shrink-0 text-muted-foreground">
            {pct(data.yourShare)} attributable to you
          </span>
        </div>

        {data.causes.length === 0 ? (
          <p className="type-body-xs text-muted-foreground">
            No delay hours recorded in this window.
          </p>
        ) : (
          <>
            <SegmentBar
              height={28}
              segments={data.causes.map((cause) => ({
                key: cause.cause,
                label: cause.label,
                value: Math.round(cause.hours),
                color: cause.color,
                foreground:
                  cause.color === 'var(--accent-bold)'
                    ? 'var(--accent-bold-foreground)'
                    : cause.color === 'var(--border-strong)'
                      ? 'var(--foreground)'
                      : 'var(--fl-neutral-0)',
              }))}
            />
            <Legend
              className="mt-3"
              items={data.causes.map((cause) => ({
                label: cause.label,
                color: cause.color,
                shape: 'square' as const,
              }))}
            />
          </>
        )}
      </div>
    </ConsolePanel>
  );
}

export default NetworkComparisonCard;
