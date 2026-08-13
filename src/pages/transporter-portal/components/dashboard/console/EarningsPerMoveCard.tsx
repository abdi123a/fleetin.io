import { ConsolePanel, SectionLabel, StatBox } from './kit';
import type { EarningsPerMove } from './model';
import { compact, djfCard, pct, signedPct, toDjf } from './money';

/**
 * What one move is worth, against what the corridor pays for the same work.
 *
 * The target is not a number somebody typed into a settings page — it is the
 * contracted network rate for exactly the moves that ran this period. So "88%
 * of target" reads as "you priced 12% under the corridor for this mix", which
 * is a sentence a transporter can take into their next rate conversation.
 *
 * A half gauge rather than a full donut: there is one value and one ceiling,
 * and the bottom half of a ring spent on nothing is space this column needs.
 */

const GAUGE_RADIUS = 76;
const GAUGE_CIRCUMFERENCE = Math.PI * GAUGE_RADIUS;

export interface EarningsPerMoveCardProps {
  data: EarningsPerMove;
  className?: string;
}

export function EarningsPerMoveCard({ data, className }: EarningsPerMoveCardProps) {
  const attainment = Math.max(0, Math.min(1.15, data.attainment));
  const filled = Math.min(1, attainment) * GAUGE_CIRCUMFERENCE;

  const sparkPeak = Math.max(1, ...data.spark.map((point) => point.value));
  const sparkFloor = Math.min(...data.spark.map((point) => point.value));
  const sparkRange = Math.max(1, sparkPeak - sparkFloor);
  const sparkPoints = data.spark
    .map((point, index) => {
      const x = (index / Math.max(1, data.spark.length - 1)) * 300 + 8;
      const y = 54 - ((point.value - sparkFloor) / sparkRange) * 42;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const lastPoint = data.spark[data.spark.length - 1];

  return (
    <ConsolePanel
      className={className}
      title="Earnings per Move"
      subtitle={`Against the ${compact(toDjf(data.target))} DJF corridor rate for this mix`}
    >
      <div className="flex justify-center pt-1">
        <svg viewBox="0 0 200 116" className="h-[124px] w-[220px]" role="img" aria-label={`${pct(data.attainment)} of the corridor rate`}>
          <circle
            cx="100"
            cy="100"
            r={GAUGE_RADIUS}
            fill="none"
            stroke="var(--surface-sunken)"
            strokeWidth="20"
            strokeDasharray={`${GAUGE_CIRCUMFERENCE} ${GAUGE_CIRCUMFERENCE * 2}`}
            transform="rotate(180 100 100)"
          />
          <circle
            cx="100"
            cy="100"
            r={GAUGE_RADIUS}
            fill="none"
            stroke={attainment >= 1 ? 'var(--fl-teal-700)' : 'var(--accent-bold)'}
            strokeWidth="20"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${GAUGE_CIRCUMFERENCE * 2}`}
            transform="rotate(180 100 100)"
          />
          <text
            x="100"
            y="90"
            textAnchor="middle"
            className="fill-foreground text-[28px] font-extrabold tabular-nums"
          >
            {compact(toDjf(data.perMove))}
          </text>
        </svg>
      </div>

      <p className="text-center text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
        DJF per move · {pct(data.attainment)} of corridor rate
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatBox
          label="Total earnings"
          value={djfCard(data.total)}
          note={
            data.totalDelta.pct === undefined ? (
              'no prior period'
            ) : (
              <span
                className={
                  data.totalDelta.good
                    ? 'text-success-subtle-foreground'
                    : 'text-accent-subtle-foreground'
                }
              >
                {data.totalDelta.pct >= 0 ? '↗' : '↘'} {signedPct(data.totalDelta.pct)}
              </span>
            )
          }
        />
        <StatBox
          label="Empty km cost"
          value={djfCard(data.emptyCost)}
          tone="attention"
          note={
            data.emptyCostDelta.pct === undefined
              ? 'no prior period'
              : `${data.emptyCostDelta.pct >= 0 ? '↗' : '↘'} ${signedPct(data.emptyCostDelta.pct)}`
          }
        />
      </div>

      <SectionLabel className="mt-5">Per move, day by day</SectionLabel>

      <svg
        viewBox="0 0 316 62"
        className="mt-3 w-full"
        style={{ height: 62 }}
        preserveAspectRatio="none"
        role="img"
        aria-label="Average earnings per move by day"
      >
        <line x1="0" y1="61" x2="316" y2="61" stroke="var(--border)" />
        <polyline
          points={`${sparkPoints} 308,61 8,61`}
          fill="var(--fl-teal-700)"
          fillOpacity="0.1"
          stroke="none"
        />
        <polyline
          points={sparkPoints}
          fill="none"
          stroke="var(--fl-teal-700)"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
      </svg>

      <p className="type-body-xs mt-2 text-muted-foreground">
        Latest day {lastPoint ? `${lastPoint.label} · ${djfCard(lastPoint.value)} per move` : '—'}
      </p>
    </ConsolePanel>
  );
}

export default EarningsPerMoveCard;
