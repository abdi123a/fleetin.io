import { useMemo, useState } from 'react';
import {
  DelayCauseBreakdown,
  DelayPartyList,
  type DelayCauseRow as DelayCauseView,
  type DelayCauseTone,
  type DelayPartyRow as DelayPartyView,
} from '@/components/console';
import { Card } from '@/design-system';
import { peekDataset } from '@/features/shipper-bi/api/biService';
import {
  DELAY_OWNER_PARTY,
  type DelayOwner,
  type DelayParty,
  type DatePreset,
} from '@/features/shipper-bi/contracts';
import { formatCompact } from '@/features/shipper-bi/format';
import { getTransporterLogoUrl } from '@/features/shipper-bi/mocks/transporterProfiles';
import { deriveFacts, type ShipmentFact } from '@/lib/bi/derive';
import { inPeriod } from '@/lib/bi/aggregate/context';
import { cn } from '@/utils';
import { PanelHeader, PanelLink, PANEL_SURFACE } from './PanelHeader';

/**
 * Delay responsibility — Import / Export scoped.
 *
 * Both flows involve the same three parties working the move:
 *   Import — Port → shipper store
 *   Export — shipper store → Port
 *
 * Who is responsible = one-line list (Shipper · Transporter · Fleetin).
 * Click a party → Root causes opens with circle graphics for that party only.
 */

type FlowTab = 'import' | 'export';

const FLOW_CORRIDOR: Record<FlowTab, string> = {
  import: 'Port → store',
  export: 'Store → Port',
};

const FLEETIN_LOGO = '/logo/fleetin-icon.png';
/** Stand-in mark for the transporter party (category, not one named carrier). */
const TRANSPORTER_PARTY_LOGO = getTransporterLogoUrl('TRP-01');

/* ---------------------------------------------------------------------------
 * Responsibility — same cast on import and export
 * ------------------------------------------------------------------------ */

/** Fixed order: shipper, then the partners who move with them. */
const PARTY_ORDER: readonly DelayParty[] = ['shipper', 'transporter', 'fleetin'];

const PARTY_LABELS: Record<DelayParty, string> = {
  shipper: 'Shipper',
  transporter: 'Transporter',
  fleetin: 'Fleetin',
};

function partyLogoUrl(
  party: DelayParty,
  shipperLogoUrl?: string,
): string | undefined {
  switch (party) {
    case 'shipper':
      return shipperLogoUrl;
    case 'fleetin':
      return FLEETIN_LOGO;
    case 'transporter':
      return TRANSPORTER_PARTY_LOGO;
  }
}

function partyDisplayName(party: DelayParty, shipperName: string): string {
  if (party === 'shipper') return shipperName || PARTY_LABELS.shipper;
  return PARTY_LABELS[party];
}

/* ---------------------------------------------------------------------------
 * Root causes — what happened (independent of who pays)
 * ------------------------------------------------------------------------ */

const ROOT_CAUSES = [
  'documentation',
  'empty_return',
  'communication',
  'dispatching',
  'force_majeure',
] as const;
type RootCause = (typeof ROOT_CAUSES)[number];

const ROOT_CAUSE_LABELS: Record<RootCause, string> = {
  documentation: 'Documentation',
  empty_return: 'Empty return',
  communication: 'Communication',
  dispatching: 'Dispatching',
  force_majeure: 'Force majeure',
};

const ROOT_CAUSE_FROM_OWNER: Record<DelayOwner, RootCause> = {
  shipper_documentation: 'documentation',
  shipper_depotage: 'empty_return',
  shipper_communication: 'communication',
  transporter: 'dispatching',
  customs: 'documentation',
  port_terminal: 'empty_return',
  shipping_line: 'dispatching',
  force_majeure: 'force_majeure',
};

/**
 * A cause keeps its depth wherever it appears, so the reader learns the mark
 * rather than re-reading the legend on every party. The five depths themselves
 * are the console brand pair — see `@/components/console`.
 */
const ROOT_CAUSE_TONE: Record<RootCause, DelayCauseTone> = {
  documentation: 'primary-bold',
  empty_return: 'primary',
  communication: 'primary-soft',
  dispatching: 'accent-bold',
  force_majeure: 'accent-soft',
};

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------ */

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

interface PartyRow {
  key: DelayParty;
  label: string;
  count: number;
  share: number;
  isOwn: boolean;
}

interface CauseRow {
  key: RootCause;
  label: string;
  count: number;
  share: number;
}

interface FlowModel {
  delayedShipments: number;
  parties: PartyRow[];
  /** Root causes keyed by responsible party — only that party's delays. */
  causesByParty: Record<DelayParty, CauseRow[]>;
}

/* ---------------------------------------------------------------------------
 * Component
 * ------------------------------------------------------------------------ */

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
  const [flow, setFlow] = useState<FlowTab>('import');
  const [selectedParty, setSelectedParty] = useState<DelayParty | null>(null);

  const models = useMemo(
    () => buildModels(shipperId, from, to, asOf ?? new Date(to)),
    [shipperId, from, to, asOf],
  );

  const model = models[flow];
  const total = model.delayedShipments;
  const importCount = models.import.delayedShipments;
  const exportCount = models.export.delayedShipments;

  const activeParty =
    selectedParty &&
    model.parties.some((party) => party.key === selectedParty && party.count > 0)
      ? selectedParty
      : null;

  const partyRows: DelayPartyView[] = model.parties.map((party) => ({
    key: party.key,
    name: partyDisplayName(party.key, shipperName),
    logoUrl: partyLogoUrl(party.key, shipperLogoUrl),
    fallback: partyDisplayName(party.key, shipperName).substring(0, 2).toUpperCase(),
    isOwn: party.isOwn,
    count: party.count,
    share: party.share,
    valueLabel: `${party.count}/${total}`,
  }));

  const selectedCauses: DelayCauseView[] =
    activeParty != null
      ? model.causesByParty[activeParty].map((cause) => ({
          key: cause.key,
          label: cause.label,
          share: cause.share,
          tone: ROOT_CAUSE_TONE[cause.key],
        }))
      : [];

  return (
    <Card
      variant="default"
      padding="none"
      className={cn('flex h-full min-h-0 flex-col', PANEL_SURFACE, className)}
    >
      <div className="flex flex-col gap-4 border-b border-border/60 px-6 pt-5 pb-4">
        <PanelHeader
          title="Delay responsibility"
          hint={
            total > 0
              ? `${formatCompact(total)} delayed · ${FLOW_CORRIDOR[flow]}`
              : undefined
          }
          action={
            onViewDetails ? (
              <PanelLink onClick={onViewDetails}>Open analytics</PanelLink>
            ) : undefined
          }
        />

        <div
          role="tablist"
          aria-label="Shipment flow"
          className="grid grid-cols-2 gap-1 rounded-card-nested bg-surface-sunken p-1"
        >
          <FlowTabButton
            active={flow === 'import'}
            onClick={() => setFlow('import')}
            label="Import"
            count={importCount}
          />
          <FlowTabButton
            active={flow === 'export'}
            onClick={() => setFlow('export')}
            label="Export"
            count={exportCount}
          />
        </div>
      </div>

      {total === 0 ? (
        <p className="flex flex-1 items-center justify-center px-6 py-10 text-center text-sm text-muted-foreground">
          No attributed {flow} delays in this period.
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
                setSelectedParty((prev) => (prev === key ? null : (key as DelayParty)))
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
                Select who is responsible to see their root causes.
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

/* ---------------------------------------------------------------------------
 * Tabs
 * ------------------------------------------------------------------------ */

function FlowTabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-1.5 rounded-[calc(var(--radius-card-nested)-4px)] px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-surface text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          'tabular-nums',
          active ? 'text-muted-foreground' : 'text-muted-foreground/70',
        )}
      >
        {count}
      </span>
    </button>
  );
}

/* ---------------------------------------------------------------------------
 * Model
 * ------------------------------------------------------------------------ */

/**
 * Split delayed shipments onto the two corridors.
 * Import = Port → store (detention-led when known).
 * Export = store → Port (demurrage-led when known).
 * Both still attribute delays to Shipper, Transporter, and Fleetin.
 */
function shipmentFlow(fact: ShipmentFact): FlowTab {
  if (fact.demurrageDays > fact.detentionDays) return 'export';
  if (fact.detentionDays > fact.demurrageDays) return 'import';

  let hash = 0;
  for (let i = 0; i < fact.shipmentId.length; i += 1) {
    hash = (hash * 31 + fact.shipmentId.charCodeAt(i)) >>> 0;
  }
  return hash % 2 === 0 ? 'import' : 'export';
}

function buildFlowModel(delayed: ShipmentFact[]): FlowModel {
  const byParty: Record<DelayParty, number> = {
    shipper: 0,
    transporter: 0,
    fleetin: 0,
  };
  const byPartyCause: Record<DelayParty, Record<RootCause, number>> = {
    shipper: emptyCauseCounts(),
    transporter: emptyCauseCounts(),
    fleetin: emptyCauseCounts(),
  };

  for (const fact of delayed) {
    const owner = fact.primaryDelayOwner;
    if (!owner) continue;
    const party = DELAY_OWNER_PARTY[owner];
    const cause = ROOT_CAUSE_FROM_OWNER[owner];
    byParty[party] += 1;
    byPartyCause[party][cause] += 1;
  }

  const total = delayed.length;

  const parties: PartyRow[] = PARTY_ORDER.map((party) => ({
    key: party,
    label: PARTY_LABELS[party],
    count: byParty[party],
    share: total > 0 ? byParty[party] / total : 0,
    isOwn: party === 'shipper',
  }));

  const causesByParty = Object.fromEntries(
    PARTY_ORDER.map((party) => {
      const partyTotal = byParty[party];
      const rows: CauseRow[] = ROOT_CAUSES.map((cause) => ({
        key: cause,
        label: ROOT_CAUSE_LABELS[cause],
        count: byPartyCause[party][cause],
        share: partyTotal > 0 ? byPartyCause[party][cause] / partyTotal : 0,
      }))
        .filter((row) => row.count > 0)
        .sort((a, b) => b.count - a.count);
      return [party, rows] as const;
    }),
  ) as Record<DelayParty, CauseRow[]>;

  return { delayedShipments: total, parties, causesByParty };
}

function emptyCauseCounts(): Record<RootCause, number> {
  return {
    documentation: 0,
    empty_return: 0,
    communication: 0,
    dispatching: 0,
    force_majeure: 0,
  };
}

function buildModels(shipperId: string, from: string, to: string, asOf: Date) {
  const dataset = peekDataset(shipperId, asOf);
  const facts = inPeriod(deriveFacts(dataset), { from, to });
  const delayed = facts.filter(
    (fact) => fact.totalDelayMinutes > 0 && fact.primaryDelayOwner,
  );

  const byFlow: Record<FlowTab, ShipmentFact[]> = {
    import: [],
    export: [],
  };
  for (const fact of delayed) {
    byFlow[shipmentFlow(fact)].push(fact);
  }

  return {
    import: buildFlowModel(byFlow.import),
    export: buildFlowModel(byFlow.export),
  };
}

export default DelayResponsibilityCard;
