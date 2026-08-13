import { useState } from 'react';
import {
  DelayCauseBreakdown,
  DelayPartyList,
  type DelayCauseRow,
  type DelayCauseTone,
  type DelayPartyRow,
} from '@/components/console';
import { getCustomerLogoUrl, type DelayCause, type DelayParty } from '@/features/transporter-bi';
import { getTransporterLogoUrl } from '@/features/shipper-bi/mocks/transporterProfiles';
import { ConsolePanel, PanelLink, PillTabs, SectionLabel } from './kit';
import type { CargoGroup, DelayOwnership } from './model';
import { CARGO_GROUPS, CARGO_GROUP_LABELS } from './model';
import { hours as formatHours } from './money';

/**
 * Whose hours the delays actually were, and then what happened.
 *
 * The same two-level panel the shipper console runs: a one-line-per-party list
 * of who owns the delay, and clicking a party opens *their* root causes as
 * circles sized by share. The number that matters is still the small one — a
 * transporter shown 99 lost hours will assume most of them are theirs and argue
 * with the chart, so the split comes first and the detail comes on demand.
 *
 * The tabs slice by cargo group rather than by import/export: on this corridor
 * every lane runs out of the port, so an import/export switch would leave one
 * side permanently empty, while a reefer delay and a flatbed delay genuinely
 * have different owners.
 */

const PARTY_INITIALS: Record<DelayParty, string> = {
  transporter: 'YO',
  customer: 'CN',
  port: 'PT',
  customs: 'CU',
  other: 'OT',
};

/**
 * A cause keeps its depth wherever it appears, so the reader learns the mark
 * rather than re-reading the legend on every party. The five depths themselves
 * are the console brand pair — see `@/components/console`.
 */
const CAUSE_TONE: Record<DelayCause, DelayCauseTone> = {
  port_congestion: 'primary-bold',
  customs_clearance: 'primary',
  loading_slot: 'accent-bold',
  unloading_slot: 'accent-soft',
  mechanical: 'primary-bold',
  documentation: 'primary',
  traffic: 'primary-soft',
  weather: 'accent-soft',
};

export interface DelayOwnershipCardProps {
  delays: Record<CargoGroup, DelayOwnership>;
  /** The logged-in carrier — its own row wears its own mark. */
  transporterId?: string;
  transporterName?: string;
  onOpenAnalytics?: () => void;
  className?: string;
}

export function DelayOwnershipCard({
  delays,
  transporterId = 'TRP-01',
  transporterName = 'Transporter (us)',
  onOpenAnalytics,
  className,
}: DelayOwnershipCardProps) {
  const available = CARGO_GROUPS.filter((group) => delays[group].delayedMoves > 0);
  const [active, setActive] = useState<CargoGroup>(available[0] ?? 'container');
  const [selectedParty, setSelectedParty] = useState<DelayParty | null>(null);
  const data = delays[active] ?? delays.container;

  const activeParty =
    selectedParty &&
    data.byParty.some((row) => row.party === selectedParty && row.hours > 0)
      ? selectedParty
      : null;

  const partyRows: DelayPartyRow[] = data.byParty.map((row) => ({
    key: row.party,
    name: row.party === 'transporter' ? transporterName : row.label,
    logoUrl: partyLogoUrl(row.party, transporterId),
    fallback: PARTY_INITIALS[row.party],
    isOwn: row.party === 'transporter',
    count: row.hours,
    share: row.share,
    valueLabel: formatHours(row.hours, 0),
  }));

  const causeRows: DelayCauseRow[] =
    activeParty != null
      ? data.causesByParty[activeParty].map((cause) => ({
          key: cause.cause,
          label: cause.label,
          share: cause.share,
          tone: CAUSE_TONE[cause.cause],
        }))
      : [];

  const activePartyLabel =
    activeParty === 'transporter'
      ? transporterName
      : (data.byParty.find((row) => row.party === activeParty)?.label ?? '');

  return (
    <ConsolePanel
      className={className}
      title="Delay responsibility"
      subtitle={`${data.delayedMoves} delayed · ${formatHours(data.hoursLost, 0)} lost`}
      action={onOpenAnalytics ? <PanelLink onClick={onOpenAnalytics}>Open analytics</PanelLink> : undefined}
      band={
        available.length > 1 ? (
          <PillTabs
            className="mt-4"
            tabs={available.map((group) => ({
              key: group,
              label: CARGO_GROUP_LABELS[group],
              count: delays[group].delayedMoves,
            }))}
            active={active}
            onChange={(group) => {
              setActive(group);
              setSelectedParty(null);
            }}
          />
        ) : undefined
      }
    >
      <SectionLabel>Who is responsible</SectionLabel>
      {partyRows.length === 0 ? (
        <p className="type-body-xs mt-3.5 text-muted-foreground">
          No delayed moves in this group — nothing to attribute.
        </p>
      ) : (
        <DelayPartyList
          className="mt-2.5"
          parties={partyRows}
          selected={activeParty}
          onSelect={(key) =>
            setSelectedParty((prev) => (prev === key ? null : (key as DelayParty)))
          }
        />
      )}

      <div className="mt-auto border-t border-border-subtle pt-4">
        <SectionLabel>
          Root causes
          {activeParty ? (
            <span className="ml-1.5 font-medium normal-case tracking-normal text-foreground/70">
              · {activePartyLabel}
            </span>
          ) : null}
        </SectionLabel>

        {!activeParty ? (
          <p className="type-body-xs mt-3 text-muted-foreground">
            Select who is responsible to see their root causes.
          </p>
        ) : causeRows.length === 0 ? (
          <p className="type-body-xs mt-3 text-muted-foreground">
            No root causes attributed to {activePartyLabel}.
          </p>
        ) : (
          <DelayCauseBreakdown className="mt-3" causes={causeRows} />
        )}
      </div>
    </ConsolePanel>
  );
}

/**
 * Only two of the five parties are companies with a mark of their own. Port,
 * Customs and Other are roles rather than accounts, so they keep initials —
 * the point of the logo is that a named counterparty is recognisable, not that
 * every row carries a picture.
 */
function partyLogoUrl(party: DelayParty, transporterId: string): string | undefined {
  switch (party) {
    case 'transporter':
      return getTransporterLogoUrl(transporterId);
    case 'customer':
      // The customer party is the shipper side as a category, so it wears the
      // mark of the account that ships the most on this corridor.
      return getCustomerLogoUrl('SHP-101');
    default:
      return undefined;
  }
}

export default DelayOwnershipCard;
