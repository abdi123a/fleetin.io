import { ConsolePanel, InsightNote, Legend } from './kit';
import type { PayingJob } from './model';
import { CARGO_GROUP_COLOR, CARGO_GROUP_LABELS } from './model';
import { compact, toDjf } from './money';

/**
 * Price against distance, one bubble per lane.
 *
 * The dashed line is the contracted corridor rate: everything above it beat
 * the network on that lane, everything below gave money away. Bubble area is
 * volume, which is what turns the panel into an argument — a lane sitting well
 * above the line with a tiny bubble is the work this fleet should be chasing,
 * and a big bubble under the line is the work it should be repricing.
 */

const PLOT = { left: 40, right: 12, top: 14, bottom: 34 };
const WIDTH = 320;
const HEIGHT = 214;
const PLOT_WIDTH = WIDTH - PLOT.left - PLOT.right;
const PLOT_HEIGHT = HEIGHT - PLOT.top - PLOT.bottom;

export interface PayingJobsCardProps {
  jobs: PayingJob[];
  className?: string;
}

export function PayingJobsCard({ jobs, className }: PayingJobsCardProps) {
  if (jobs.length === 0) return null;

  const maxKm = Math.max(...jobs.map((job) => job.distanceKm)) * 1.12;
  const maxRate = Math.max(...jobs.map((job) => Math.max(job.ratePerMove, job.networkRate))) * 1.12;
  const maxMoves = Math.max(...jobs.map((job) => job.moves));

  const x = (km: number) => PLOT.left + (km / maxKm) * PLOT_WIDTH;
  const y = (rate: number) => PLOT.top + PLOT_HEIGHT - (toDjf(rate) / toDjf(maxRate)) * PLOT_HEIGHT;
  const r = (moves: number) => 6 + (moves / Math.max(1, maxMoves)) * 7;

  const gridSteps = [0.25, 0.5, 0.75, 1];

  /** The contracted rate line, drawn from the mean rate-per-km of the lanes. */
  const meanRatePerKm =
    jobs.reduce((sum, job) => sum + job.networkRate / job.distanceKm, 0) / jobs.length;

  const above = jobs.filter((job) => job.ratePerMove >= job.networkRate);
  const best = [...above].sort(
    (a, b) => b.ratePerMove / b.distanceKm - a.ratePerMove / a.distanceKm,
  )[0];
  const worst = [...jobs]
    .filter((job) => job.ratePerMove < job.networkRate)
    .sort((a, b) => a.ratePerMove / a.networkRate - b.ratePerMove / b.networkRate)[0];

  return (
    <ConsolePanel
      className={className}
      title="Which Jobs Actually Pay"
      subtitle="Price per move against distance, by cargo type"
    >
      <Legend
        className="pb-2"
        items={[
          { label: 'Container', color: CARGO_GROUP_COLOR.container, shape: 'square' },
          { label: 'Bulk', color: CARGO_GROUP_COLOR.bulk, shape: 'square' },
          { label: 'Special', color: CARGO_GROUP_COLOR.special, shape: 'square' },
        ]}
      />

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        style={{ height: HEIGHT }}
        role="img"
        aria-label="Rate per move against distance, by lane"
      >
        {gridSteps.map((step) => {
          const gy = PLOT.top + PLOT_HEIGHT - step * PLOT_HEIGHT;
          return (
            <g key={step}>
              <line
                x1={PLOT.left}
                y1={gy}
                x2={WIDTH - PLOT.right}
                y2={gy}
                stroke="var(--border-subtle)"
                strokeDasharray="4 4"
              />
              <text
                x={PLOT.left - 6}
                y={gy + 3.5}
                textAnchor="end"
                className="text-[9.5px] font-medium"
                fill="var(--muted-foreground)"
              >
                {compact(toDjf(maxRate) * step)}
              </text>
            </g>
          );
        })}

        <line
          x1={PLOT.left}
          y1={PLOT.top + PLOT_HEIGHT}
          x2={WIDTH - PLOT.right}
          y2={PLOT.top + PLOT_HEIGHT}
          stroke="var(--border)"
        />

        {/* The contracted corridor rate — the line every bubble is judged by. */}
        <line
          x1={x(0)}
          y1={y(0)}
          x2={x(maxKm)}
          y2={y(meanRatePerKm * maxKm)}
          stroke="var(--border-strong)"
          strokeWidth="1.4"
          strokeDasharray="5 4"
        />
        <text
          x={WIDTH - PLOT.right}
          y={y(meanRatePerKm * maxKm) - 7}
          textAnchor="end"
          className="text-[9.5px] font-semibold"
          fill="var(--muted-foreground)"
        >
          network rate line
        </text>

        {jobs.map((job) => (
          <circle
            key={job.routeId}
            cx={x(job.distanceKm)}
            cy={y(job.ratePerMove)}
            r={r(job.moves)}
            fill={CARGO_GROUP_COLOR[job.group]}
            fillOpacity="0.82"
          >
            <title>
              {job.label} — {job.moves} moves, {compact(toDjf(job.ratePerMove))} DJF per move
            </title>
          </circle>
        ))}

        {[0, 0.25, 0.5, 0.75, 1].map((step) => (
          <text
            key={step}
            x={PLOT.left + step * PLOT_WIDTH}
            y={HEIGHT - 18}
            textAnchor="middle"
            className="text-[9.5px] font-medium"
            fill="var(--muted-foreground)"
          >
            {Math.round(maxKm * step)}
          </text>
        ))}
        <text
          x={PLOT.left}
          y={HEIGHT - 4}
          className="text-[9px] font-semibold tracking-wide"
          fill="var(--muted-foreground)"
        >
          DISTANCE PER MOVE (KM) · BUBBLE = VOLUME
        </text>
      </svg>

      <InsightNote tone="attention" className="mt-3">
        Everything above the dashed line beats the corridor rate.{' '}
        {best ? (
          <span className="font-bold">
            {best.label} pays best per kilometre
          </span>
        ) : (
          <span className="font-bold">No lane is beating the corridor rate right now</span>
        )}
        {worst ? <> — {worst.label} sits below it.</> : '.'}
      </InsightNote>

      <p className="type-body-xs mt-3 text-muted-foreground">
        {above.length} of {jobs.length} lanes priced at or above the network rate ·{' '}
        {CARGO_GROUP_LABELS[jobs[0]?.group ?? 'container']} is your densest lane group.
      </p>
    </ConsolePanel>
  );
}

export default PayingJobsCard;
