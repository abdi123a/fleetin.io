import { useMemo, useState } from 'react';
import {
  DelayCauseBreakdown,
  DelayPartyList,
  type DelayCauseRow as DelayCauseView,
  type DelayCauseTone,
  type DelayPartyRow as DelayPartyView,
} from '@/components/console';
import { Card } from '@/design-system';
import {
  DELAY_REASON_LABELS,
  useMissionReports,
  useShipperMissionIndex,
  type DelayReason,
  type ResponsibleParty,
} from '@/components/reports';
import type { DatePreset } from '@/features/shipper-bi/contracts';
import { formatCompact } from '@/features/shipper-bi/format';
import { getTransporterLogoUrl } from '@/features/shipper-bi/mocks/transporterProfiles';
import { cn } from '@/utils';
import { PanelHeader, PanelLink, PANEL_SURFACE } from './PanelHeader';

/**
 * Delay responsibility, built on the same attribution the mission and monthly
 * reports print.
 *
 * This card used to read `dataset.delays` from the BI pipeline — an array the
 * backend has no model to fill (see `biService.ts`), so it was empty for
 * every shipper, always. `deriveAttribution()` (in the reports module) is the
 * one place in the app that actually produces a party for a delay: it reads
 * the container-return deadline against dépotage and the return leg, and
 * marks anything the timestamps cannot separate `under_review` rather than
 * guessing. Those `under_review` cases are real but not yet attributable to
 * one of the three parties below, so they are left out of the count here
 * rather than forced onto one — the count a reader sees always equals the sum
 * of the party rows.
 *
 * There is no Import/Export split any more: that came from a BI concept
 * (demurrage vs. detention) the mission model doesn't have, and the old
 * fallback for shipments that carried neither was a hash of the shipment id —
 * a coin flip wearing a label. One list for the period is the honest shape.
 */

type Party = 'shipper' | 'transporter' | 'fleetin';

const PARTY_ORDER: readonly Party[] = ['shipper', 'transporter', 'fleetin'];

const PARTY_LABELS: Record<Party, string> = {
  shipper: 'Shipper',
  transporter: 'Transporter',
  fleetin: 'Fleetin',
};

/** `driver` folds into `transporter` — a driver is the transporter's own agent.
 * `port_terminal` / `shipping_line` / `external` / `under_review` are outside
 * this card's three parties and stay out of the count. */
const PARTY_FROM_RESPONSIBLE: Partial<Record<ResponsibleParty, Party>> = {
  client_shipper: 'shipper',
  transporter: 'transporter',
  driver: 'transporter',
  fleetin: 'fleetin',
};

const CAUSE_TONES: readonly DelayCauseTone[] = [
  'primary-bold',
  'primary',
  'primary-soft',
  'accent-bold',
  'accent-soft',
];

const FLEETIN_LOGO = '/logo/fleetin-icon.png';
/** Stand-in mark for the transporter party (category, not one named carrier). */
const TRANSPORTER_PARTY_LOGO = getTransporterLogoUrl('TRP-01');

function partyLogoUrl(party: Party, shipperLogoUrl?: string): string | undefined {
  switch (party) {
    case 'shipper':
      return shipperLogoUrl;
    case 'fleetin':
      return FLEETIN_LOGO;
    case 'transporter':
      return TRANSPORTER_PARTY_LOGO;
  }
}

function partyDisplayName(party: Party, shipperName: string): string {
  if (party === 'shipper') return shipperName || PARTY_LABELS.shipper;
  return PARTY_LABELS[party];
}

export interface DelayResponsibilityCardProps {
  shipperId: string;
  asOf?: Date;
  preset?: DatePreset;
  from: string;
  to: string;
  className?: string;
  onViewDetails?: () => void;
  /** Logged-in shipper identity — logo shown on the Shipper row. */
  shipperName?: string;
  shipperLogoUrl?: string;
}

interface CauseRow {
  key: DelayReason;
  label: string;
  count: number;
  share: number;
}

interface PartyRow {
  key: Party;
  count: number;
  share: number;
  causes: CauseRow[];
}

export function DelayResponsibilityCard({
  shipperId,
  asOf,
  from,
  to,
  className = '',
  onViewDetails,
  shipperName = 'Shipper',
  shipperLogoUrl,
}: DelayResponsibilityCardProps) {
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);

  const now = useMemo(() => asOf ?? new Date(to), [asOf, to]);
  const { rows: missionIndex } = useShipperMissionIndex(shipperId, now);

  const periodRows = useMemo(() => {
    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime();
    return missionIndex.filter((row) => {
      const at = new Date(row.createdAt).getTime();
      return !Number.isNaN(at) && at >= fromMs && at <= toMs;
    });
  }, [missionIndex, from, to]);

  const { reports, isLoading } = useMissionReports(periodRows, now.getTime(), shipperName);

  const { total, parties } = useMemo(() => {
    const byParty = new Map<Party, { count: number; causes: Map<DelayReason, number> }>(
      PARTY_ORDER.map((party) => [party, { count: 0, causes: new Map() }]),
    );

    let attributedTotal = 0;
    for (const report of reports) {
      const attribution = report.attribution;
      if (!attribution) continue;
      const party = PARTY_FROM_RESPONSIBLE[attribution.party];
      if (!party) continue;

      attributedTotal += 1;
      const bucket = byParty.get(party);
      if (!bucket) continue;
      bucket.count += 1;
      bucket.causes.set(attribution.reason, (bucket.causes.get(attribution.reason) ?? 0) + 1);
    }

    const partyRows: PartyRow[] = PARTY_ORDER.map((party) => {
      const bucket = byParty.get(party);
      const count = bucket?.count ?? 0;
      const causes: CauseRow[] = Array.from(bucket?.causes.entries() ?? [])
        .map(([reason, causeCount]) => ({
          key: reason,
          label: DELAY_REASON_LABELS[reason],
          count: causeCount,
          share: count > 0 ? causeCount / count : 0,
        }))
        .sort((a, b) => b.count - a.count);
      return {
        key: party,
        count,
        share: attributedTotal > 0 ? count / attributedTotal : 0,
        causes,
      };
    });

    return { total: attributedTotal, parties: partyRows };
  }, [reports]);

  const activeParty =
    selectedParty && parties.some((party) => party.key === selectedParty && party.count > 0)
      ? selectedParty
      : null;

  const partyRows: DelayPartyView[] = parties.map((party) => ({
    key: party.key,
    name: partyDisplayName(party.key, shipperName),
    logoUrl: partyLogoUrl(party.key, shipperLogoUrl),
    fallback: partyDisplayName(party.key, shipperName).substring(0, 2).toUpperCase(),
    isOwn: party.key === 'shipper',
    count: party.count,
    share: party.share,
    valueLabel: `${party.count}/${total}`,
  }));

  const activePartyRow = activeParty ? parties.find((party) => party.key === activeParty) : undefined;
  const selectedCauses: DelayCauseView[] =
    activePartyRow?.causes.map((cause, index) => ({
      key: cause.key,
      label: cause.label,
      share: cause.share,
      tone: CAUSE_TONES[index % CAUSE_TONES.length] as DelayCauseTone,
    })) ?? [];

  return (
    <Card
      variant="default"
      padding="none"
      className={cn('flex h-full min-h-0 flex-col', PANEL_SURFACE, className)}
    >
      <div className="flex flex-col gap-1 border-b border-border/60 px-6 pt-5 pb-4">
        <PanelHeader
          title="Delay Responsibility"
          hint={total > 0 ? `${formatCompact(total)} attributed this period` : undefined}
          action={
            onViewDetails ? (
              <PanelLink onClick={onViewDetails}>Open analytics</PanelLink>
            ) : undefined
          }
        />
      </div>

      {isLoading ? (
        <p className="flex flex-1 items-center justify-center px-6 py-10 text-center text-sm text-muted-foreground">
          Reading mission timelines…
        </p>
      ) : total === 0 ? (
        <p className="flex flex-1 items-center justify-center px-6 py-10 text-center text-sm text-muted-foreground">
          No container crossed its return deadline in this period — nothing to attribute.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-5 px-6 py-5">
          {/* Who — one line each; click to open root causes */}
          <section aria-labelledby="delay-who-heading">
            <h4 id="delay-who-heading" className="type-label text-muted-foreground">
              Who is responsible
            </h4>
            <DelayPartyList
              className="mt-2"
              parties={partyRows}
              selected={activeParty}
              onSelect={(key) =>
                setSelectedParty((prev) => (prev === key ? null : (key as Party)))
              }
            />
          </section>

          {/* Root causes — circles; only for the selected party */}
          <section
            aria-labelledby="delay-cause-heading"
            className="border-t border-border-subtle pt-4"
          >
            <h4 id="delay-cause-heading" className="type-label text-muted-foreground">
              Root causes
              {activeParty ? (
                <span className="ml-1.5 font-medium normal-case tracking-normal text-foreground/70">
                  · {PARTY_LABELS[activeParty]}
                </span>
              ) : null}
            </h4>

            {!activeParty ? (
              <p className="mt-3 type-body-sm text-muted-foreground">
                Select a party to see its root causes.
              </p>
            ) : selectedCauses.length === 0 ? (
              <p className="mt-3 type-body-sm text-muted-foreground">
                No root causes attributed to {PARTY_LABELS[activeParty]}.
              </p>
            ) : (
              <DelayCauseBreakdown className="mt-3" causes={selectedCauses} />
            )}
          </section>
        </div>
      )}
    </Card>
  );
}

export default DelayResponsibilityCard;
