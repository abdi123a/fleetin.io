import type { ReactNode } from 'react';
import { IconChip } from '@/design-system';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ContainerIcon,
  Timer,
  Wallet,
} from '@/design-system/icons';
import { formatCompact, formatCurrencyFull } from '@/features/shipper-bi/format';
import { cn } from '@/utils';
import { Sparkline } from './kit';
import type { ShipperInsight } from './buildInsight';

/**
 * The four numbers the page leads with, as filled brand tiles.
 *
 * The first version of this row was four white cards with a figure on each, and
 * the user's verdict was that it read as rectangles rather than a dashboard.
 * Three things fix that, and all three are in the reference dashboards they
 * pointed at:
 *
 * - **The tile carries the colour**, so the row reads as one object with four
 *   parts instead of four unrelated boxes on a grey field. The palette is the
 *   `--tile-*` set the shipper dashboard's own KPI strip already uses, so the
 *   two pages open the same way.
 * - **Every number has its shape under it.** A level with no history is a
 *   figure; a level with its own sparkline is a trend. This is the single
 *   biggest difference between a stat and a dashboard.
 * - **The change is on the tile**, as a chip, against the equivalent window
 *   before it — the thing this page can say that the dashboard cannot.
 *
 * Figures are proportional, not tabular: `tabular-nums` gives every digit the
 * width of a zero, which makes a display-size number look loose. Tabular is for
 * columns that must align, which is the book at the bottom of the page.
 */

type TileTone = 'teal' | 'sky' | 'peach' | 'orange';

const TILE: Record<
  TileTone,
  { surface: string; label: string; value: string; chipOnFill: string; spark: string }
> = {
  teal: {
    surface: 'bg-tile-teal text-tile-teal-foreground',
    label: 'text-tile-teal-foreground/80',
    value: 'text-tile-teal-foreground',
    chipOnFill: 'bg-tile-teal-foreground/15 text-tile-teal-foreground',
    spark: 'text-tile-teal-foreground',
  },
  sky: {
    surface: 'bg-tile-sky text-tile-foreground',
    label: 'text-tile-foreground/75',
    value: 'text-tile-foreground',
    chipOnFill: 'bg-tile-foreground/10 text-tile-foreground',
    spark: 'text-tile-foreground',
  },
  peach: {
    surface: 'bg-tile-peach text-tile-foreground',
    label: 'text-tile-foreground/75',
    value: 'text-tile-foreground',
    chipOnFill: 'bg-tile-foreground/10 text-tile-foreground',
    spark: 'text-tile-foreground',
  },
  orange: {
    surface: 'bg-[var(--fl-orange-400)] text-tile-foreground',
    label: 'text-tile-foreground/75',
    value: 'text-tile-foreground',
    chipOnFill: 'bg-tile-foreground/10 text-tile-foreground',
    spark: 'text-tile-foreground',
  },
};

export function HeroTiles({ insight }: { insight: ShipperInsight }) {
  const { headline, onTime, money, trend } = insight;
  const leaking = money.avoidableShare >= 0.05;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Tile
        tone="teal"
        icon={<ContainerIcon />}
        label="Containers moved"
        value={formatCompact(headline.runs.value)}
        caption={onTime.stillMoving > 0 ? `${onTime.stillMoving} still moving` : 'all landed'}
        delta={headline.runs.delta}
        deltaKind={headline.runs.deltaKind}
        polarity={headline.runs.polarity}
        spark={trend.map((point) => point.runs)}
      />

      <Tile
        tone="sky"
        icon={<CheckCircle2 />}
        label="On-time delivery"
        value={`${Math.round(headline.onTimeRate.value * 100)}%`}
        caption={`of ${onTime.delivered} delivered`}
        delta={headline.onTimeRate.delta}
        deltaKind={headline.onTimeRate.deltaKind}
        polarity={headline.onTimeRate.polarity}
        spark={trend.map((point) =>
          point.onTimeRate === undefined ? undefined : point.onTimeRate * 100,
        )}
      />

      <Tile
        tone="peach"
        icon={<Wallet />}
        label="Total spend"
        value={formatCompact(money.total)}
        caption={`${formatCurrencyFull(money.perContainer)} per container`}
        delta={headline.spend.delta}
        deltaKind={headline.spend.deltaKind}
        polarity={headline.spend.polarity}
        spark={trend.map((point) => point.spend)}
      />

      {/* The fourth tile changes with the account. When avoidable charges are
          material they take the orange slot, because that is the number worth
          a decision; when they are not, the slot reports transit time instead
          of leaving a loud tile saying everything is fine. */}
      {leaking ? (
        <Tile
          tone="orange"
          icon={<Timer />}
          label="Avoidable charges"
          value={formatCompact(money.avoidable)}
          caption={`${Math.round(money.avoidableShare * 100)}% of the bill was not transport`}
          spark={trend.map((point) => point.avoidable)}
        />
      ) : (
        <Tile
          tone="orange"
          icon={<Timer />}
          label="Door to door"
          value={`${headline.doorToDoorDays.value.toFixed(1)}d`}
          caption="booking to delivery, average"
          delta={headline.doorToDoorDays.delta}
          deltaKind={headline.doorToDoorDays.deltaKind}
          polarity={headline.doorToDoorDays.polarity}
          spark={trend.map((point) => point.runs)}
        />
      )}
    </div>
  );
}

function Tile({
  tone,
  icon,
  label,
  value,
  caption,
  delta,
  deltaKind = 'percent',
  polarity = 'up_is_good',
  spark,
}: {
  tone: TileTone;
  icon: ReactNode;
  label: string;
  value: string;
  caption: string;
  delta?: number;
  deltaKind?: 'percent' | 'points';
  polarity?: 'up_is_good' | 'down_is_good';
  spark: Array<number | undefined>;
}) {
  const skin = TILE[tone];
  const rising = (delta ?? 0) > 0;
  const Arrow = rising ? ArrowUp : ArrowDown;
  // A rate's change is read in points, a quantity's in percent — see
  // `Figure.deltaKind`. Both are drawn against the window before this one.
  const showDelta = delta !== undefined && Math.abs(delta) >= (deltaKind === 'points' ? 0.005 : 0.005);
  const improving = (polarity === 'up_is_good') === rising;

  return (
    <article
      className={cn(
        'flex flex-col gap-4 rounded-lg p-5 shadow-sm transition-shadow hover:shadow-card',
        skin.surface,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <IconChip tint={tone === 'teal' ? 'on-teal' : 'on-light'} size={36}>
          {icon}
        </IconChip>
        {showDelta ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11.5px] font-semibold',
              skin.chipOnFill,
            )}
            title={`${improving ? 'Better' : 'Worse'} than the equivalent window before this one`}
          >
            <Arrow className="size-3" aria-hidden />
            {deltaKind === 'points'
              ? `${Math.abs(delta * 100).toFixed(0)} pts`
              : `${Math.abs(delta * 100).toFixed(0)}%`}
          </span>
        ) : null}
      </div>

      <div>
        <p className={cn('text-[2.1rem] font-semibold leading-none tracking-tight', skin.value)}>
          {value}
        </p>
        <p className={cn('mt-2 text-[13px] font-medium', skin.label)}>{label}</p>
      </div>

      <div className="mt-auto">
        <Sparkline
          points={spark}
          className={skin.spark}
          strokeClassName="stroke-current"
          fillClassName="fill-current"
        />
        <p className={cn('mt-1 text-[11.5px]', skin.label)}>{caption}</p>
      </div>
    </article>
  );
}
