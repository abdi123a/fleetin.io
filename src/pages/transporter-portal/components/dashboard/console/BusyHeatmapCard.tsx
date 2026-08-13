import { ConsolePanel, PanelOutlineLink } from './kit';
import type { BusyHeatmap } from './model';

/**
 * When the fleet actually starts work.
 *
 * A heatmap because the question has two dimensions — hour and weekday — and
 * any line chart of "moves per hour" flattens the one that matters: a Tuesday
 * 09:00 peak and a Saturday 09:00 lull are the same point on that line. The
 * amber cells are the hours where every truck was already committed, which is
 * to say the hours where more work would have had to be turned away.
 */

/** Ordinal teal ramp, quiet to busy, with amber reserved for the top band. */
const RAMP = [
  'var(--surface-sunken)',
  'var(--fl-teal-100)',
  'var(--fl-teal-300)',
  'var(--fl-teal-600)',
  'var(--accent-bold)',
];

export interface BusyHeatmapCardProps {
  data: BusyHeatmap;
  onPlanSlots?: () => void;
  className?: string;
}

export function BusyHeatmapCard({ data, onPlanSlots, className }: BusyHeatmapCardProps) {
  const band = (value: number) => {
    if (value <= 0) return 0;
    const step = Math.ceil((value / data.max) * (RAMP.length - 1));
    return Math.min(RAMP.length - 1, Math.max(1, step));
  };

  return (
    <ConsolePanel
      className={className}
      title="When Your Trucks Are Busy"
      subtitle="Moves started per hour, all cargo types"
      action={
        <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
          Quiet
          <span className="flex gap-[3px]">
            {RAMP.map((color) => (
              <span
                key={color}
                className="h-2.5 w-3.5 rounded-[2px]"
                style={{ background: color }}
                aria-hidden
              />
            ))}
          </span>
          Peak
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="type-body-xs text-muted-foreground">
            Amber cells are the hours where every truck was already committed —{' '}
            <span className="font-bold text-foreground">{data.peak.hourLabel}</span> is where you
            turn work away.
          </p>
          {onPlanSlots ? <PanelOutlineLink onClick={onPlanSlots}>Plan slots →</PanelOutlineLink> : null}
        </div>
      }
    >
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-[3px]">
          <thead>
            <tr>
              <th className="w-9" />
              {data.hours.map((hour) => (
                <th
                  key={hour}
                  scope="col"
                  className="pb-1 text-[10.5px] font-medium text-muted-foreground"
                >
                  {String(hour).padStart(2, '0')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.days.map((day) => (
              <tr key={day.label}>
                <th
                  scope="row"
                  className="pr-1 text-left text-[10.5px] font-semibold text-muted-foreground"
                >
                  {day.label}
                </th>
                {data.hours.map((hour, index) => {
                  const value = day.cells[index] ?? 0;
                  return (
                    <td key={`${day.label}-${hour}`} className="p-0">
                      <div
                        className="h-[22px] rounded-[4px]"
                        style={{ background: RAMP[band(value)] }}
                        title={`${day.label} ${String(hour).padStart(2, '0')}:00 — ${value} ${value === 1 ? 'move' : 'moves'}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ConsolePanel>
  );
}

export default BusyHeatmapCard;
