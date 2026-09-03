import { Badge, Button, Card, IconChip } from '@/design-system';
import { Route, Warehouse } from '@/design-system/icons';
import { formatCo2, formatKm } from '@/lib/co2';
import { cn } from '@/utils';

import type { CycleImpact, ImpactStatus } from '../api/emissionsService';
import { useClearCycleImpact, useDecideCycleImpact } from '../api/queries';

/**
 * Fleetin Impact, wherever a pairing's record is shown.
 *
 * The other account. `Co2Figure` says what a truck put out; this says what a
 * realized match stopped a truck driving — the `Free Zone → Garage → Port`
 * repositioning it would have made between two jobs. The two never share a
 * block, a colour or a total: carbon is green, impact is the environmental
 * yellow beside it (`--impact`, never teal), and a reader should be able to
 * tell at a glance which question a figure answers.
 *
 * Nothing here computes. Every verdict was reached server-side from the
 * bookings' own rungs and is printed with the evidence that reached it —
 * which is the point of the record: a saving a shipper can be told about is
 * one that can be shown.
 */

/** The lifecycle word, with `counted` as the stage past `realized`. */
export type ImpactStage = ImpactStatus | 'counted';

export const IMPACT_STATUS_META: Record<
  ImpactStage,
  { label: string; intent: 'default' | 'success' | 'success-deep' | 'warning'; variant: 'solid' | 'subtle' }
> = {
  matched: { label: 'Matched', intent: 'default', variant: 'subtle' },
  /* Green, and one deep step for the count — the same green/deep pairing the
     container badges use, so "realized" and "counted" read as one word and
     its stronger form rather than as two colours. */
  realized: { label: 'Realized', intent: 'success', variant: 'subtle' },
  counted: { label: 'Counted', intent: 'success-deep', variant: 'solid' },
  /* Amber, not red: a match that was not realized is a trip that happened
     the ordinary way, not an error. Same call the broken chain makes. */
  not_realized: { label: 'Not realized', intent: 'warning', variant: 'subtle' },
};

export function impactStageOf(impact: Pick<CycleImpact, 'status' | 'countedAt'>): ImpactStage {
  return impact.status === 'realized' && impact.countedAt ? 'counted' : impact.status;
}

export function ImpactStatusBadge({
  impact,
  className,
}: {
  impact: Pick<CycleImpact, 'status' | 'countedAt'>;
  className?: string;
}) {
  const meta = IMPACT_STATUS_META[impactStageOf(impact)];
  return (
    <Badge intent={meta.intent} variant={meta.variant} size="sm" className={cn('shrink-0', className)}>
      {meta.label}
    </Badge>
  );
}

/**
 * `Free Zone → Port` — the continuation, by the names of the two places.
 *
 * Falls back to the roles when a shipment end is off the catalogue, because
 * the shape of the movement is the fact even when its ends are not on file.
 */
export function ContinuationLine({ impact, className }: { impact: CycleImpact; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <Route className="size-3.5 shrink-0 text-impact-subtle-foreground" aria-hidden />
      <span className="truncate">
        <span className="font-semibold text-foreground">{impact.from?.name ?? 'Free Zone'}</span>
        <span className="mx-1 text-muted-foreground">→</span>
        <span className="font-semibold text-foreground">{impact.to?.name ?? 'Port'}</span>
      </span>
    </span>
  );
}

/**
 * The impact block on a booking's sheet.
 *
 * One card per continuation the booking is an end of — most bookings have
 * none, a chain's middle link has two. Each card is the figure, the movement,
 * and the evidence: when the pairing was made, when the truck was seen at the
 * port, how long after the empty left, which truck, and whether the road was
 * measured or drawn straight.
 *
 * The verdict is the operator's to correct. The rungs cannot see a truck that
 * went home for the night and came back out, and they cannot see a
 * continuation nobody stamped — so a person can say either, and their word
 * is kept over any later automatic pass.
 */
export function FleetinImpactBlock({
  impacts,
  canDecide = false,
  className,
}: {
  impacts: CycleImpact[];
  /** Whether the viewer may say what physically happened — `empty-returns.update`. */
  canDecide?: boolean;
  className?: string;
}) {
  if (impacts.length === 0) return null;
  return (
    <div className={cn('space-y-2', className)}>
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Fleetin Impact</h3>
      {impacts.map((impact) => (
        <ImpactCard key={impact.cycleId} impact={impact} canDecide={canDecide} />
      ))}
    </div>
  );
}

function ImpactCard({ impact, canDecide }: { impact: CycleImpact; canDecide: boolean }) {
  const decide = useDecideCycleImpact();
  const clear = useClearCycleImpact();
  const stage = impactStageOf(impact);
  const busy = decide.isPending || clear.isPending;
  const avoided = impact.avoided;
  const km = formatKm(avoided?.distanceKm);
  const co2 = formatCo2(avoided?.co2Kg);

  /* What a reader of this booking is looking at: the box that left under the
     next load, or the load that continued from the free zone. */
  const roleLine =
    impact.role === 'empty'
      ? `This empty left under ${impact.nextLoad.reference}`
      : impact.role === 'next_load'
        ? `Continued from ${impact.empty.reference}'s empty`
        : `${impact.empty.reference} → ${impact.nextLoad.reference}`;

  return (
    <Card className="space-y-2.5 rounded-lg border border-impact-border/40 bg-impact-subtle/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <IconChip icon={Route} tint="impact" size={36} />
          <div className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Fleetin Match
            </span>
            <ContinuationLine impact={impact} className="text-sm" />
            <span className="block truncate text-[11px] text-muted-foreground">{roleLine}</span>
          </div>
        </div>
        <ImpactStatusBadge impact={impact} />
      </div>

      {/* The two figures, only once there is a saving to state. A matched
          pairing has saved nothing yet and prints nothing — a "0 km" here
          would read as measured and found to be nothing. */}
      {stage === 'realized' || stage === 'counted' ? (
        <div className="grid grid-cols-2 gap-2">
          <Figure label="Distance Avoided" value={km.value} unit={km.unit} />
          <Figure label="CO₂ Avoided" value={co2.value} unit={co2.unit} />
        </div>
      ) : null}

      {/* The sentence the spec asks for, and the evidence under it. */}
      {(stage === 'realized' || stage === 'counted') && (
        <p className="text-[11px] text-foreground">
          Eliminated expected{' '}
          <span className="font-semibold">{impact.from?.name ?? 'Free Zone'}</span>
          <span className="mx-1 text-muted-foreground">→</span>
          <span className="inline-flex items-center gap-1 font-semibold">
            <Warehouse className="size-3 text-muted-foreground" aria-hidden />
            {impact.garage?.name ?? 'Garage'}
          </span>
          <span className="mx-1 text-muted-foreground">→</span>
          <span className="font-semibold">{impact.to?.name ?? 'Port'}</span> repositioning.
        </p>
      )}

      <ul className="space-y-0.5 text-[11px] text-muted-foreground">
        {impact.matchedAt && <li>Matched {formatWhen(impact.matchedAt)}</li>}
        {impact.realizedAt && (
          <li>
            At the port {formatWhen(impact.realizedAt)}
            {impact.continuationMinutes !== null && (
              <> · {formatSpan(impact.continuationMinutes)} after the empty left</>
            )}
          </li>
        )}
        {impact.vehicle && <li>Truck {impact.vehicle.plate}</li>}
        {avoided && (
          <li className="flex flex-wrap items-center gap-1.5">
            {avoided.toGarageKm.toFixed(1)} km to the garage + {avoided.fromGarageKm.toFixed(1)} km back out
            {avoided.provider === 'haversine' && (
              <Badge variant="subtle" intent="default" size="sm" className="text-[10px]">
                Straight line
              </Badge>
            )}
          </li>
        )}
        {impact.status === 'realized' && !impact.countedAt && impact.countedOn && (
          <li>Counted on {impact.countedOn} — the same trip</li>
        )}
        {impact.note && <li className="text-warning-subtle-foreground">{impact.note}</li>}
        {impact.source === 'operator' && impact.decidedBy && <li>Decided by {impact.decidedBy}</li>}
      </ul>

      {/* The operator's door. A verdict given here is kept over every later
          automatic pass, so it also has an undo — "Re-judge from rungs" —
          rather than standing forever on a misclick. Two carriers cannot be
          made into one truck's trip, so a refused cross-carrier pairing
          offers nothing to confirm. */}
      {canDecide && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-impact-border/30 pt-2">
          {impact.source === 'operator' && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              disabled={busy}
              onClick={() => clear.mutate(impact.cycleId)}
            >
              Re-judge from rungs
            </Button>
          )}
          {impact.status === 'realized' || impact.status === 'matched' ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              disabled={busy}
              onClick={() => decide.mutate({ cycleId: impact.cycleId, realized: false })}
            >
              Truck went to the garage
            </Button>
          ) : impact.continuable ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              disabled={busy}
              onClick={() => decide.mutate({ cycleId: impact.cycleId, realized: true })}
            >
              Confirm continuation
            </Button>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function Figure({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-md bg-card px-2.5 py-2">
      <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="flex items-baseline gap-1">
        <strong className="text-base font-bold tabular-nums text-foreground">{value}</strong>
        <span className="text-[11px] font-semibold text-muted-foreground">{unit}</span>
      </span>
    </div>
  );
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSpan(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
}
