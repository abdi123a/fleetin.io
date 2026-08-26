import { Timer, Wallet } from '@/design-system/icons';
import { DonutChart } from '@/features/shipper-bi/charts';
import type { CategorySlice } from '@/features/shipper-bi/contracts';
import { formatCompact, formatCurrencyFull } from '@/features/shipper-bi/format';
import { TONE, Block, EmptyNote, Readout } from './kit';
import { StackedColumns } from './charts';
import type { ShipperInsight } from './buildInsight';

/**
 * Question two — **what am I paying for, and what could I have avoided?** —
 * again as two cards.
 *
 * The split that matters to a shipper is not "freight vs fees" by accounting
 * category; it is *transport I had to pay for* against *charges I could have
 * prevented*. So the stack has exactly two parts and the orange one is the
 * whole point. The card beside it breaks that orange down into the lines that
 * caused it, which is where the fix actually is.
 *
 * Four cards became these two: average cost by cargo type, a cargo-type cost
 * trend with its own dropdown, a cost breakdown, and a detention-and-demurrage
 * scatter that was also rendered, byte for byte, on the Containers tab.
 */

export function SpendTrendCard({
  insight,
  className,
}: {
  insight: ShipperInsight;
  className?: string;
}) {
  const { money, trend } = insight;
  const leaking = money.avoidableShare >= 0.05;

  return (
    <Block
      className={className}
      title="Where is my money going?"
      answer={
        money.total === 0
          ? 'No charges recorded in this period.'
          : money.avoidable === 0
            ? 'Every franc went to transport — no waiting, detention or demurrage at all.'
            : `${formatCurrencyFull(money.avoidable)} of ${formatCurrencyFull(money.total)} was not transport${
                money.biggestLeak ? `, mostly ${money.biggestLeak.label.toLowerCase()}` : ''
              }.`
      }
      icon={<Wallet />}
      tint={leaking ? 'orange' : 'teal'}
      bodyClassName="gap-4"
    >
      <StackedColumns
        categories={trend.map((point) => point.label)}
        series={[
          {
            name: 'Transport',
            data: trend.map((point) => Math.round(point.spend - point.avoidable)),
            color: 'var(--primary)',
          },
          {
            name: 'Avoidable',
            data: trend.map((point) => Math.round(point.avoidable)),
            color: 'var(--accent-bold)',
          },
        ]}
        formatValue={(value) => formatCompact(value)}
        minHeight={252}
      />

      <div className="flex flex-wrap gap-x-10 gap-y-4 border-t border-border-subtle pt-4">
        <Readout label="Total spend" value={formatCurrencyFull(money.total)} />
        <Readout label="Average per container" value={formatCurrencyFull(money.perContainer)} />
        <Readout
          label="Avoidable share"
          value={`${Math.round(money.avoidableShare * 100)}%`}
          attention={leaking}
        />
      </div>
    </Block>
  );
}

export function AvoidableCard({
  insight,
  className,
}: {
  insight: ShipperInsight;
  className?: string;
}) {
  const { money } = insight;
  const leaking = money.avoidableShare >= 0.05;

  // The ring answers "which avoidable line is the problem", so it plots only
  // the avoidable lines. Including transport would make one 90% arc and four
  // slivers, which shows the reader nothing they did not already know.
  const leakSlices: CategorySlice[] = money.breakdown
    .filter((slice) => slice.tone === 'attention' && slice.value > 0)
    .map((slice) => ({
      key: slice.key,
      label: slice.label,
      value: Math.round(slice.value),
    }));

  return (
    <Block
      className={className}
      title="What could I have avoided?"
      answer={
        leakSlices.length === 0
          ? 'Nothing — the whole bill was transport.'
          : `Waiting, penalty and handling lines, ranked by what they cost you.`
      }
      icon={<Timer />}
      tint={leaking ? 'orange' : 'teal'}
      bodyClassName="justify-between gap-5"
    >
      {leakSlices.length === 0 ? (
        <EmptyNote>
          No waiting, detention, demurrage or storage charges in this period. Nothing to recover.
        </EmptyNote>
      ) : (
        <>
          <DonutChart
            slices={leakSlices}
            colors={leakSlices.map(
              (_, index) => TONE.attentionRamp[Math.min(index, TONE.attentionRamp.length - 1)],
            )}
            centerValue={formatCompact(money.avoidable)}
            centerLabel="avoidable"
            formatValue={(value) => formatCompact(value)}
            size={330}
            className="mx-auto"
          />

          <ul className="flex flex-col gap-2">
            {leakSlices.map((slice, index) => (
              <li
                key={slice.key}
                className="flex items-center justify-between gap-4 rounded-md bg-surface-sunken px-4 py-2.5"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{
                      background:
                        TONE.attentionRamp[Math.min(index, TONE.attentionRamp.length - 1)],
                    }}
                    aria-hidden
                  />
                  <span className="truncate text-[13.5px] font-medium text-foreground">
                    {slice.label}
                  </span>
                </span>
                <span className="shrink-0 text-[13.5px] font-semibold tabular-nums text-foreground">
                  {formatCurrencyFull(slice.value)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Block>
  );
}
