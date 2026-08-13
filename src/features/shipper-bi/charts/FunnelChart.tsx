import { cn } from '@/utils';
import { stepColor } from './chartTheme';

/**
 * An ordered sequence of stages, drawn as tapering bands.
 *
 * A pipeline is not a ranked list — the order is fixed by the process, not by
 * the values — so it takes the ordinal ramp and keeps its own sequence rather
 * than sorting by size. The taper is what separates it from a bar chart: the
 * width carries the count, and reading top to bottom follows the freight.
 *
 * Each band is labelled with its own count and share, and the step between
 * bands is called out where it is worth calling out, since "where does the
 * work pile up" is the question a pipeline is asked.
 */

export interface FunnelStage {
  key: string;
  label: string;
  value: number;
}

export interface FunnelChartProps {
  stages: FunnelStage[];
  /** Denominator for each band's share. Defaults to the sum of all stages. */
  total?: number;
  formatValue?: (value: number) => string;
  onSelect?: (stage: FunnelStage) => void;
  className?: string;
}

/** Narrowest a non-zero band may be drawn, so it stays a visible, clickable mark. */
const MIN_WIDTH_PCT = 6;

export function FunnelChart({
  stages,
  total,
  formatValue = (value) => String(value),
  onSelect,
  className,
}: FunnelChartProps) {
  const sum = total ?? stages.reduce((acc, stage) => acc + stage.value, 0);
  const max = Math.max(...stages.map((stage) => stage.value), 1);

  return (
    <ol className={cn('flex flex-col gap-1', className)}>
      {stages.map((stage, index) => {
        const width =
          stage.value === 0 ? 0 : Math.max(MIN_WIDTH_PCT, (stage.value / max) * 100);
        const share = sum === 0 ? 0 : (stage.value / sum) * 100;
        const color = stepColor(index, stages.length);
        const Row = onSelect ? 'button' : 'div';

        return (
          <li key={stage.key}>
            <Row
              type={onSelect ? 'button' : undefined}
              onClick={onSelect ? () => onSelect(stage) : undefined}
              className={cn(
                'group flex w-full items-center gap-3 rounded-card-nested py-1 text-left',
                onSelect &&
                  'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              )}
            >
              <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">
                {stage.label}
              </span>

              {/* The band itself. Centred so the taper reads as a funnel
                  narrowing rather than a bar chart growing from the left. */}
              <span className="relative flex h-8 min-w-0 flex-1 items-center justify-center">
                <span
                  aria-hidden
                  className="absolute inset-y-0 rounded-[3px] transition-[width] duration-500 group-hover:brightness-95"
                  style={{
                    width: `${width}%`,
                    backgroundColor: color,
                    // A wash, not a saturated block — the ramp still reads.
                    opacity: 0.55,
                  }}
                />
                {stage.value > 0 ? (
                  <span className="relative text-xs font-semibold tabular-nums text-foreground">
                    {formatValue(stage.value)}
                  </span>
                ) : (
                  <span className="relative text-[11px] text-muted-foreground">—</span>
                )}
              </span>

              <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                {share.toFixed(1)}%
              </span>
            </Row>
          </li>
        );
      })}
    </ol>
  );
}
