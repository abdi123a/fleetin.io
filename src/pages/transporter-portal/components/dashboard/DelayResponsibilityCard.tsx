import { useMemo } from 'react';
import { Card } from '@/design-system';
import {
  DELAY_CAUSES,
  DELAY_CAUSE_LABELS,
  DELAY_CAUSE_PARTY,
  DELAY_PARTIES,
  DELAY_PARTY_LABELS,
  formatCompact,
  formatDuration,
  type DelayCause,
  type DelayParty,
  type TripFact,
} from '@/features/transporter-bi';
import { cn } from '@/utils';
import { PANEL_SURFACE } from '@/pages/shippers/components/dashboard/console/PanelHeader';
import { ExpandLink } from './ExpandLink';

/**
 * Delay responsibility — who owns the lost minutes on this transporter's trips.
 *
 * "Your share" is the transporter party total. The cause list under it is only
 * the causes mapped to that party, so the card answers "what can we fix" without
 * diluting the view with port or customer minutes.
 */

const OWN_PARTY: DelayParty = 'transporter';

const OWN_CAUSES = DELAY_CAUSES.filter(
  (cause) => DELAY_CAUSE_PARTY[cause] === OWN_PARTY,
);

export interface DelayResponsibilityCardProps {
  facts: TripFact[];
  onExpand?: () => void;
  className?: string;
}

interface PartyRow {
  key: DelayParty;
  label: string;
  minutes: number;
  share: number;
  isOwn: boolean;
}

interface CauseRow {
  key: DelayCause;
  label: string;
  minutes: number;
  share: number;
}

export function DelayResponsibilityCard({
  facts,
  onExpand,
  className,
}: DelayResponsibilityCardProps) {
  const model = useMemo(() => buildModel(facts), [facts]);

  return (
    <Card
      variant="default"
      padding="none"
      className={cn('flex h-full min-h-0 flex-col', PANEL_SURFACE, className)}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border/60 px-6 pt-5 pb-4">
        <div className="min-w-0">
          <h3 className="type-h3 text-foreground">Delay responsibility</h3>
          <p className="type-body-xs mt-0.5 text-muted-foreground">
            {model.totalMinutes > 0
              ? `${formatCompact(model.delayedTrips)} delayed · ${formatDuration(model.totalMinutes)} lost`
              : 'Who owns the lost minutes'}
          </p>
        </div>
        {onExpand ? <ExpandLink label="Open delay analytics" onClick={onExpand} /> : null}
      </div>

      {model.totalMinutes === 0 ? (
        <p className="flex flex-1 items-center justify-center px-6 py-10 text-center text-sm text-muted-foreground">
          No attributed delays in this period.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-5 px-6 py-5">
          <div className="rounded-card-nested border border-primary/15 bg-primary-subtle px-4 py-3.5">
            <p className="type-label text-primary-subtle-foreground/80">Your share</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="type-h2 tabular-nums text-primary-subtle-foreground">
                {formatDuration(model.ownMinutes)}
              </p>
              <p className="type-body-sm tabular-nums text-primary-subtle-foreground/75">
                {(model.ownShare * 100).toFixed(0)}% of delay ·{' '}
                {formatCompact(model.ownTrips)} trip
                {model.ownTrips === 1 ? '' : 's'}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="type-label text-muted-foreground">By party</p>
            <ul className="flex flex-col gap-1.5">
              {model.parties.map((party) => (
                <li
                  key={party.key}
                  className={cn(
                    'flex flex-col gap-1.5 rounded-card-nested px-2 py-1.5',
                    party.isOwn && 'bg-primary-subtle/60',
                  )}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="type-body-sm truncate font-medium text-foreground">
                      {party.label}
                      {party.isOwn ? (
                        <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                          You
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        'type-body-sm shrink-0 tabular-nums',
                        party.isOwn
                          ? 'font-semibold text-primary-subtle-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      {(party.share * 100).toFixed(0)}% · {formatDuration(party.minutes)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-full rounded-full transition-[width] duration-500',
                        party.isOwn
                          ? 'bg-gradient-to-r from-primary to-primary-hover'
                          : 'bg-muted-foreground/40',
                      )}
                      style={{ width: `${Math.max(4, party.share * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {model.ownCauses.length > 0 ? (
            <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
              <p className="type-label text-muted-foreground">Your delay causes</p>
              <ul className="flex flex-col gap-1">
                {model.ownCauses.map((cause) => (
                  <li
                    key={cause.key}
                    className="relative overflow-hidden rounded-card-nested px-2 py-2 text-sm"
                  >
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 rounded-card-nested bg-primary/12"
                      style={{ width: `${Math.max(6, cause.share * 100)}%` }}
                    />
                    <div className="relative flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate font-medium text-foreground">
                        {cause.label}
                      </span>
                      <span className="shrink-0 tabular-nums text-primary-subtle-foreground">
                        {formatDuration(cause.minutes)}
                        <span className="ml-1.5 text-[11px] text-muted-foreground">
                          {(cause.share * 100).toFixed(0)}%
                        </span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function buildModel(facts: TripFact[]) {
  const delayed = facts.filter((fact) => fact.delayMinutes > 0);

  const byParty: Record<DelayParty, number> = {
    transporter: 0,
    port: 0,
    customs: 0,
    customer: 0,
    other: 0,
  };
  const byCause: Partial<Record<DelayCause, number>> = {};

  for (const fact of delayed) {
    for (const party of DELAY_PARTIES) {
      byParty[party] += fact.delayByParty[party] ?? 0;
    }
    for (const cause of OWN_CAUSES) {
      byCause[cause] = (byCause[cause] ?? 0) + (fact.delayByCause[cause] ?? 0);
    }
  }

  const totalMinutes = DELAY_PARTIES.reduce((sum, party) => sum + byParty[party], 0);
  const ownMinutes = byParty[OWN_PARTY];
  const ownTrips = delayed.filter(
    (fact) => (fact.delayByParty[OWN_PARTY] ?? 0) > 0,
  ).length;

  const parties: PartyRow[] = DELAY_PARTIES.map((party) => ({
    key: party,
    label: DELAY_PARTY_LABELS[party],
    minutes: byParty[party],
    share: totalMinutes > 0 ? byParty[party] / totalMinutes : 0,
    isOwn: party === OWN_PARTY,
  }))
    .filter((row) => row.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);

  const ownCauses: CauseRow[] = OWN_CAUSES.map((cause) => ({
    key: cause,
    label: DELAY_CAUSE_LABELS[cause],
    minutes: byCause[cause] ?? 0,
    share: ownMinutes > 0 ? (byCause[cause] ?? 0) / ownMinutes : 0,
  }))
    .filter((row) => row.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);

  return {
    delayedTrips: delayed.length,
    totalMinutes,
    ownMinutes,
    ownShare: totalMinutes > 0 ? ownMinutes / totalMinutes : 0,
    ownTrips,
    parties,
    ownCauses,
  };
}

export default DelayResponsibilityCard;
