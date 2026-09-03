import { Badge, Card, IconChip } from '@/design-system';
import { Route } from '@/design-system/icons';
import { formatCo2, formatFactor, formatKm } from '@/lib/co2';
import { cn } from '@/utils';

import type { CycleImpact, ImpactStatus } from '../api/emissionsService';

/**
 * Fleetin Impact, wherever a pairing's record is shown.
 *
 * The other account. `Co2Figure` says what a truck put out; this says what a
 * realized match stopped a truck driving — the `Free Zone → Garage → Port`
 * repositioning it would have made between two jobs. The two never share a
 * block, a colour or a total: carbon is green, impact is the environmental
 * yellow beside it (`--impact`, never teal).
 *
 * Numbers, and the sums behind them, and nothing else. The first version of
 * this card printed the whole evidence trail — when the pairing was made,
 * when the truck was seen at the port, how long after, which lorry — and two
 * buttons asking the operator to rule on it. The user's reaction on
 * 2026-09-03: "it's asking me to confirm a lot of things … I want to see the
 * numbers." So the card is now two lines of arithmetic a reader can check by
 * hand, and the verdict controls live only in the API. The evidence is still
 * on the record for an audit; it is just not on the card.
 */

/** The lifecycle word, with `counted` as the stage past `realized`. */
export type ImpactStage = ImpactStatus | 'counted';

export const IMPACT_STATUS_META: Record<
  ImpactStage,
  { label: string; intent: 'default' | 'success' | 'success-deep' | 'warning'; variant: 'solid' | 'subtle' }
> = {
  /* The lifecycle in the reader's words, not the column's.
   *
   * "Matched / Realized / Counted / Not realized" is the state machine's own
   * vocabulary and it told a reader nothing: two of the four are past
   * participles of things they never saw happen, and the difference between
   * "Realized" and "Counted" — that the second one is in the total and the
   * first is a duplicate of a trip already counted — is invisible in the
   * words. Each label now says what it means for the number on the right. */
  matched: { label: 'Not yet driven', intent: 'default', variant: 'subtle' },
  /* Green, and one deep step for the one that counts — the same green/deep
     pairing the container badges use, so the two read as one word and its
     stronger form rather than as two colours. */
  realized: { label: 'Already counted', intent: 'success', variant: 'subtle' },
  counted: { label: 'Saved', intent: 'success-deep', variant: 'solid' },
  /* Amber, not red: a match that was not realized is a trip that happened
     the ordinary way, not an error. Same call the broken chain makes. */
  not_realized: { label: 'No saving', intent: 'warning', variant: 'subtle' },
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
  const from = impact.from?.name ?? 'Free Zone';
  const to = impact.to?.name ?? 'Port';
  return (
    /* `flex` + `max-w-full`, and `min-w-0` on the text: an inline-flex sizes
       to its content and never truncates, and a flex item's minimum width is
       its content unless told otherwise. Both were missing, and a long free
       zone name walked straight out of the card. */
    <span className={cn('flex max-w-full min-w-0 items-center gap-1.5', className)} title={`${from} → ${to}`}>
      <Route className="size-3.5 shrink-0 text-impact-subtle-foreground" aria-hidden />
      <span className="min-w-0 truncate">
        <span className="font-semibold text-foreground">{shortPlace(from)}</span>
        <span className="mx-1 text-muted-foreground">→</span>
        <span className="font-semibold text-foreground">{shortPlace(to)}</span>
      </span>
    </span>
  );
}

/**
 * A catalogue name at the length a sheet can afford.
 *
 * The catalogue spells places out in full — "Djibouti International Free Trade
 * Zone (DIFTZ)", "Damerjog / DDID port infrastructure" — which is right for a
 * picker and wrong for a 440px card that has to fit two of them and an arrow.
 * The acronym in brackets is what the yard calls the place; the first segment
 * of a slashed or dashed name is the place itself. The full name stays in the
 * tooltip.
 */
export function shortPlace(name: string): string {
  const acronym = name.match(/\(([A-Z][A-Z0-9]{1,7})\)/)?.[1];
  if (acronym) return acronym;
  const head = name.split(/\s+[/—–-]\s+/)[0]?.trim();
  return head || name;
}

/**
 * The impact block on a booking's sheet.
 *
 * One card per continuation the booking is an end of, and a card only when
 * there is a saving to show. A pairing that was not realized, or has not been
 * driven yet, is one quiet line — it has no number, so it gets no card.
 */
export function FleetinImpactBlock({ impacts, className }: { impacts: CycleImpact[]; className?: string }) {
  if (impacts.length === 0) return null;
  return (
    <div className={cn('space-y-2', className)}>
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Fleetin Impact</h3>
      {impacts.map((impact) => (
        <ImpactCard key={impact.cycleId} impact={impact} />
      ))}
    </div>
  );
}

function ImpactCard({ impact }: { impact: CycleImpact }) {
  const stage = impactStageOf(impact);
  /* The booking at the other end of the pairing — the one thing a reader of
     this sheet needs to place the saving. */
  const other = impact.role === 'empty' ? impact.nextLoad.reference : impact.empty.reference;

  if (stage === 'not_realized') {
    return (
      <p className="text-[11px] text-muted-foreground">
        Match with {other} not realized{impact.note ? ` — ${impact.note}` : ''}.
      </p>
    );
  }
  if (stage === 'matched') {
    /* Name the rung that is missing, not the gap. The server says which
       fact it is waiting for; the two it can be are the empty's collection
       and the next load's delivery, and each is somebody's next click. */
    const waitingOn = impact.note ?? '';
    const ask = /not been collected/.test(waitingOn)
      ? `record Empty Picked Up on ${impact.empty.reference} to count it`
      : /pickup time/.test(waitingOn)
        ? `record ${impact.nextLoad.reference}'s pickup at the port to count it`
        : `nothing avoided until ${impact.nextLoad.reference} is delivered`;
    return (
      <p className="text-[11px] text-muted-foreground">
        Matched with {other} — {ask}.
      </p>
    );
  }

  const avoided = impact.avoided;
  const km = formatKm(avoided?.distanceKm);
  const co2 = formatCo2(avoided?.co2Kg);

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
            <span className="block truncate text-[11px] text-muted-foreground">
              {impact.role === 'empty' ? `Left under ${other}` : `Continued from ${other}`}
              {impact.model === 'handover' && impact.nextTransporter && impact.transporter
                ? ` · ${impact.nextTransporter.name}'s truck, for ${impact.transporter.name}'s box`
                : ''}
            </span>
          </div>
        </div>
        <ImpactStatusBadge impact={impact} />
      </div>

      {/* The two sums. Each line is the arithmetic and its answer, so the
          figure can be checked without reading anything else. */}
      {avoided ? (
        <dl className="space-y-1.5">
          {/* Two sums for two kinds of saving. A continuation is one truck's
              garage round trip. A handover is the empty carrier's trip out and
              home, less the detour the other carrier's truck drove to come
              through the free zone. */}
          {impact.model === 'handover' ? (
            <CalcLine
              label="Distance avoided"
              sum={`${avoided.fromGarageKm.toFixed(1)} km out + ${avoided.toGarageKm.toFixed(1)} km home for ${impact.garage ? shortPlace(impact.garage.name) : 'the garage'} − ${(avoided.detourKm ?? 0).toFixed(1)} km detour by ${impact.nextTransporter?.name ?? 'the next load'}`}
              result={`${km.value} ${km.unit}`}
              straightLine={avoided.provider === 'haversine'}
            />
          ) : (
            <CalcLine
              label="Distance avoided"
              sum={`${avoided.toGarageKm.toFixed(1)} km to ${impact.garage ? shortPlace(impact.garage.name) : 'the garage'} + ${avoided.fromGarageKm.toFixed(1)} km back to ${impact.to ? shortPlace(impact.to.name) : 'the port'}`}
              result={`${km.value} ${km.unit}`}
              straightLine={avoided.provider === 'haversine'}
            />
          )}
          {avoided.co2Kg !== null ? (
            <CalcLine
              label="CO₂ avoided"
              sum={`${km.value} km × ${formatFactor(avoided.co2FactorUsed)}`}
              result={`${avoided.co2Kg.toFixed(1)} ${co2.unit}`}
              note={FACTOR_BASIS[avoided.factorBasis ?? '']}
            />
          ) : (
            <CalcLine label="CO₂ avoided" result="Not priced" note="no truck factor to price it with" />
          )}
        </dl>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Not measured{impact.note ? ` — ${impact.note}` : ''}.
        </p>
      )}

      {impact.countedOn && (
        <p className="text-[11px] text-muted-foreground">Same trip as {impact.countedOn}, counted there.</p>
      )}
    </Card>
  );
}

/** Whose factor priced a saving, in the words the sheet uses. */
const FACTOR_BASIS: Record<string, string | undefined> = {
  next_load_truck: undefined,
  delivery_truck: "the empty's delivery truck",
  fleet_average: 'fleet average factor',
};

/** `label   sum = result`, on one line — or just the answer when there is no sum to show. */
function CalcLine({
  label,
  sum,
  result,
  note,
  straightLine,
}: {
  label: string;
  sum?: string;
  result: string;
  note?: string;
  straightLine?: boolean;
}) {
  return (
    <div className="rounded-md bg-card px-2.5 py-2">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="flex flex-wrap items-baseline gap-x-1.5 text-[11px] text-muted-foreground">
        {sum && (
          <>
            <span>{sum}</span>
            <span>=</span>
          </>
        )}
        <strong className="text-base font-bold tabular-nums text-foreground">{result}</strong>
        {note && <span>— {note}</span>}
        {straightLine && (
          <Badge variant="subtle" intent="default" size="sm" className="text-[10px]">
            Straight line
          </Badge>
        )}
      </dd>
    </div>
  );
}
