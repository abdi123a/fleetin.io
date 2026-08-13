import {
  ConsolePanel,
  InsightNote,
  StatBox,
} from '@/pages/transporter-portal/components/dashboard/console/kit';
import { cn } from '@/utils';

import type { OutstandingModel } from './model';

/**
 * One number with a remainder: how many boxes are not back at the hub, and
 * how loudly their clocks are ticking.
 *
 * Same donut grammar as the transporter's Empty Legs panel — arcs around a
 * centre figure, then the same total broken into rows — because a reader who
 * knows one console should be able to read the other. The centre states the
 * conclusion (boxes still out); the arcs say how much of that is already an
 * alarm. Teal is comfortable, amber is asking, red has already run out, and
 * grey is the box nobody can judge because no deadline was ever captured.
 */

const RADIUS = 70;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface ReturnsOutstandingCardProps {
  data: OutstandingModel;
  className?: string;
}

export function ReturnsOutstandingCard({ data, className }: ReturnsOutstandingCardProps) {
  const total = data.stillOut || 1;

  let offset = 0;
  const segments = data.buckets
    .filter((bucket) => bucket.count > 0)
    .map((bucket) => {
      const length = (bucket.count / total) * CIRCUMFERENCE;
      const segment = { ...bucket, length, offset };
      offset += length;
      return segment;
    });

  const gaps = data.unverified + data.missing;

  return (
    <ConsolePanel
      className={className}
      title="Returns Outstanding"
      subtitle="Every box not yet back at the hub"
      footer={
        <p className="type-body-xs leading-relaxed text-muted-foreground">
          Slack = return deadline − predicted gate-in. At the 6 h safety cutoff, matching stops and
          the return switches to standalone — protection beats matching, always.
        </p>
      }
    >
      <div className="flex justify-center pb-2 pt-1">
        <svg
          viewBox="0 0 200 200"
          className="h-[180px] w-[180px]"
          role="img"
          aria-label={`${data.stillOut} containers still out`}
        >
          <circle
            cx="100"
            cy="100"
            r={RADIUS}
            fill="none"
            stroke="var(--surface-sunken)"
            strokeWidth="26"
          />
          {segments.map((segment) => (
            <circle
              key={segment.key}
              cx="100"
              cy="100"
              r={RADIUS}
              fill="none"
              stroke={segment.color}
              strokeWidth="26"
              strokeDasharray={`${segment.length} ${CIRCUMFERENCE}`}
              strokeDashoffset={-segment.offset}
              transform="rotate(-90 100 100)"
            />
          ))}
          <text
            x="100"
            y="92"
            textAnchor="middle"
            className="fill-muted-foreground text-[11px] font-medium"
          >
            Boxes still out
          </text>
          <text
            x="100"
            y="126"
            textAnchor="middle"
            className="fill-foreground text-[34px] font-extrabold tabular-nums"
          >
            {data.stillOut}
          </text>
        </svg>
      </div>

      <div className="flex flex-col gap-2">
        {data.buckets.map((bucket) => (
          <div key={bucket.key} className="flex items-center justify-between gap-3">
            <span className="type-body-xs inline-flex min-w-0 items-center gap-2 text-foreground">
              <span
                className="size-[7px] shrink-0 rounded-full"
                style={{ background: bucket.color }}
                aria-hidden
              />
              <span className="truncate">{bucket.label}</span>
            </span>
            <span
              className={cn(
                'rounded-md px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums',
                bucket.count > 0
                  ? 'bg-surface-sunken text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              {bucket.count}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatBox
          label="Back on time"
          value={data.returnedOnTime}
          note="protected — cannot regress"
        />
        <StatBox
          label="Deadline gaps"
          tone={gaps > 0 ? 'attention' : 'neutral'}
          value={gaps}
          note={
            gaps > 0 ? `${data.unverified} unverified · ${data.missing} missing` : 'all confirmed'
          }
        />
      </div>

      {gaps > 0 ? (
        <InsightNote tone="attention" className="mt-3">
          {gaps} open return{gaps === 1 ? ' has' : 's have'} no confirmed deadline — those clocks
          cannot be judged. Chase the shipping line before they surprise you.
        </InsightNote>
      ) : null}
    </ConsolePanel>
  );
}

export default ReturnsOutstandingCard;
