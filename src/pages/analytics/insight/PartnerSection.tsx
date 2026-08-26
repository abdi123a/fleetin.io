import { MapPin, Route, Truck } from '@/design-system/icons';
import { Avatar } from '@/design-system';
import { getTransporterLogoUrl } from '@/features/shipper-bi/mocks/transporterProfiles';
import { formatCurrencyFull } from '@/features/shipper-bi/format';
import { cn } from '@/utils';
import { ON_TIME_TARGET, Block, EmptyNote } from './kit';
import type { RankedParty, ShipperInsight } from './buildInsight';

/**
 * Question four: **who moves my cargo well, and which lanes cost me?**
 *
 * Two ranked rails, ordered by volume so the top row is always the partner or
 * lane the account actually depends on. The bar is the on-time rate and it
 * turns orange below target, so "who should get less work next month" is
 * answered by looking rather than by reading five numeric columns.
 *
 * **Volume ranks, punctuality colours.** Deliberately not the reverse: a
 * transporter with one perfect run is not the one to give more work to, and
 * sorting by rate puts them on top.
 *
 * Every transporter wears its logo. A named company rendered as bare text is
 * the one thing this system does not do — the mark is how a reader finds their
 * own partner in a list without reading it.
 *
 * This replaces a five-column sortable table and a cost-versus-reliability
 * bubble scatter, which plotted every transporter on two axes to make a point
 * one sorted list already makes.
 */
export function TransporterCard({
  insight,
  className,
}: {
  insight: ShipperInsight;
  className?: string;
}) {
  const { transporters } = insight;
  const best = [...transporters]
    .filter((party) => party.onTimeRate !== undefined && party.runs >= 3)
    .sort((a, b) => (b.onTimeRate as number) - (a.onTimeRate as number))[0];

  return (
    <Block
      className={className}
      title="Who moves my cargo?"
      answer={
        best
          ? `${best.name} is your most reliable, at ${Math.round((best.onTimeRate as number) * 100)}% on time across ${best.runs} runs.`
          : 'Ranked by how much of your work each transporter carries.'
      }
      icon={<Truck />}
    >
      {transporters.length === 0 ? (
        <EmptyNote>No transporter activity in this period.</EmptyNote>
      ) : (
        <ul className="flex flex-col gap-4">
          {transporters.map((party, index) => (
            <PartyRow key={party.id} party={party} rank={index + 1} kind="transporter" />
          ))}
        </ul>
      )}
    </Block>
  );
}

export function LaneCard({
  insight,
  className,
}: {
  insight: ShipperInsight;
  className?: string;
}) {
  const { routes } = insight;
  const worstLane = [...routes]
    .filter((lane) => lane.onTimeRate !== undefined && lane.runs >= 3)
    .sort((a, b) => (a.onTimeRate as number) - (b.onTimeRate as number))[0];

  return (
    <Block
      className={className}
      title="Which lanes are working?"
      answer={
        worstLane
          ? `${worstLane.name} is your weakest lane, at ${Math.round((worstLane.onTimeRate as number) * 100)}% on time.`
          : 'Ranked by how many containers ran on each lane.'
      }
      icon={<Route />}
      tint={worstLane && (worstLane.onTimeRate as number) < ON_TIME_TARGET ? 'orange' : 'teal'}
    >
      {routes.length === 0 ? (
        <EmptyNote>No lane activity in this period.</EmptyNote>
      ) : (
        <ul className="flex flex-col gap-4">
          {routes.map((lane, index) => (
            <PartyRow key={lane.id} party={lane} rank={index + 1} kind="lane" />
          ))}
        </ul>
      )}
    </Block>
  );
}

function PartyRow({
  party,
  rank,
  kind,
}: {
  party: RankedParty;
  rank: number;
  kind: 'transporter' | 'lane';
}) {
  const rate = party.onTimeRate;
  const below = rate !== undefined && rate < ON_TIME_TARGET;
  const logoUrl = kind === 'transporter' ? getTransporterLogoUrl(party.id) : undefined;

  return (
    <li className="flex items-center gap-3.5">
      {/* Rank first, so the order is stated rather than merely implied by
          position — a list that has been sorted for you should say so. */}
      <span className="type-body-xs w-4 shrink-0 text-right font-semibold tabular-nums text-muted-foreground">
        {rank}
      </span>

      {kind === 'transporter' ? (
        <Avatar src={logoUrl} name={party.name} size="sm" shape="rounded" className="shrink-0" />
      ) : (
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary-subtle-foreground [&_svg]:size-4"
          aria-hidden
        >
          <MapPin />
        </span>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[13.5px] font-medium text-foreground">{party.name}</span>
          <span
            className={cn(
              'shrink-0 text-[13.5px] font-semibold tabular-nums',
              below ? 'text-accent-subtle-foreground' : 'text-foreground',
            )}
          >
            {rate === undefined ? 'not landed yet' : `${Math.round(rate * 100)}%`}
          </span>
        </div>

        {/*
          The bar is teal whatever the rate, and the target notch says whether
          it cleared the bar. Painting every below-target row orange was
          technically the rule and visually wrong: on a real account most
          partners sit under 90%, so eleven orange bars turned the page's one
          alarm colour into its background colour. Orange is now spent only on
          money lost and promises missed — here it rides the figure, where one
          glance still finds the weak rows.
        */}
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out motion-reduce:transition-none"
            style={{ width: `${Math.max(Math.min(rate ?? 0, 1) * 100, 2)}%` }}
          />
          <span
            className="absolute inset-y-0 w-px bg-foreground/35"
            style={{ left: `${ON_TIME_TARGET * 100}%` }}
            aria-hidden
            title={`${Math.round(ON_TIME_TARGET * 100)}% target`}
          />
        </div>

        <p className="type-body-xs tabular-nums text-muted-foreground">
          {[
            `${party.runs} run${party.runs === 1 ? '' : 's'}`,
            ...(party.avgDays !== undefined && party.avgDays > 0
              ? [`${party.avgDays.toFixed(1)}d door to door`]
              : []),
            `${formatCurrencyFull(party.avgCost)} avg`,
          ].join(' · ')}
        </p>
      </div>
    </li>
  );
}
