import { useMemo } from 'react';

import { Badge, Button } from '@/design-system';
import { Check, PackageOpen, Star, Zap } from '@/design-system/icons';
import { useBookings } from '@/features/bookings/api/queries';
import type { BookingRecord } from '@/features/bookings/api/bookingsService';
import { useAvailableEmpties, useEmptyContainers } from '@/features/empty-returns';
import { summariseFleet } from '@/lib/rating';
import type { PartnerRecord } from '@/types/partner';
import {
  SCHEDULED_WINDOW_MS,
  recommendTransporters,
  type TransporterScore,
} from '@/features/transporters/recommendation';
import { HelpHint } from '@/components/common';
import { CompanyMark } from '@/features/transporter-bi/cards/CompanyLabel';
import { cn } from '@/utils';

/**
 * The five carriers this shipment should probably go to, and why.
 *
 * Shown before the transporter picker rather than beside it, because on a
 * shipment where somebody is already holding the right empty box the answer is
 * usually one of these five and the operator should not have to hunt for it in
 * a list of forty. The manual picker is one click away and always available —
 * this ranks, it never blocks.
 *
 * Every score prints the reasons that produced it. A number a reader cannot
 * argue with is a number they cannot trust, and the one input that matters most
 * here — how many empties the carrier is sitting on — is invisible from
 * anywhere else in this wizard.
 */
export function TransporterRecommendations({
  partners,
  line,
  sizes,
  pickupAt,
  vehiclesNeeded,
  rateOf,
  considerEmpties,
  assignedPartnerIds,
  onChoose,
  onChooseManually,
}: {
  partners: PartnerRecord[];
  line: string;
  sizes: string[];
  pickupAt: number;
  vehiclesNeeded: number;
  rateOf: (partner: PartnerRecord) => number;
  /** Container shipments only — bulk and machinery have no box to reuse. */
  considerEmpties: boolean;
  assignedPartnerIds: string[];
  onChoose: (partnerId: string) => void;
  onChooseManually: () => void;
}) {
  const { data: available = [], isLoading } = useAvailableEmpties();
  /* The Empty Return calendar. `records` is the module's own book of
     containers, so a return planned in Empty Container Management shows up here
     without a second source of truth to keep in step. */
  const { records } = useEmptyContainers();

  /* The whole book, once. Ratings are an average over a carrier's closed
     bookings, so there is no per-carrier query that would answer this without
     five round trips — and this list is at most a few hundred rows. */
  const { data: bookingPage } = useBookings({ limit: 500 });
  const allBookings = useMemo(() => bookingPage?.items ?? [], [bookingPage]);

  /**
   * Returns already booked around this pickup, per carrier.
   *
   * Keyed by lowercased legal name: the empty-return record carries its carrier
   * as the company name the original load was delivered under, with no partner
   * id to join on.
   */
  const scheduledByName = useMemo(() => {
    const counts = new Map<string, number>();
    if (!considerEmpties) return counts;
    for (const record of records) {
      if (record.stage !== 'return_planned') continue;
      if (record.plannedReturnAt === null) continue;
      if (Math.abs(record.plannedReturnAt - pickupAt) > SCHEDULED_WINDOW_MS) continue;
      const key = record.transporter.trim().toLowerCase();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [records, pickupAt, considerEmpties]);

  /**
   * Each carrier's derived star rating, from the bookings they have closed.
   *
   * The same arithmetic the transporter dossier prints, so the number in this
   * panel and the number on their profile can never disagree — see
   * `summarisePerformance`. Carriers with nothing closed come back `null` and
   * the dimension simply does not apply to them.
   */
  const ratingByPartner = useMemo(() => {
    const byPartner = new Map<string, BookingRecord[]>();
    for (const booking of allBookings) {
      if (!booking.partnerId) continue;
      const bucket = byPartner.get(booking.partnerId);
      if (bucket) bucket.push(booking);
      else byPartner.set(booking.partnerId, [booking]);
    }
    return new Map(
      [...byPartner].map(([partnerId, bookings]) => {
        const summary = summariseFleet(bookings);
        return [partnerId, summary.missions > 0 ? summary.overall : null] as const;
      }),
    );
  }, [allBookings]);

  const { ranked, noEmptiesAnywhere } = useMemo(
    () =>
      recommendTransporters({
        partners,
        available,
        line,
        sizes,
        pickupAt,
        vehiclesNeeded,
        rateOf,
        considerEmpties,
        scheduledByName,
        ratingOf: (partner) => ratingByPartner.get(partner.id) ?? null,
      }),
    [
      partners,
      available,
      line,
      sizes,
      pickupAt,
      vehiclesNeeded,
      rateOf,
      considerEmpties,
      scheduledByName,
      ratingByPartner,
    ],
  );

  const top = ranked.slice(0, 5);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <Zap className="h-3.5 w-3.5 text-primary" />
          Recommended transporters
          {/* The five lines that used to sit under this heading. True and
              useful the first time, noise on the four hundredth — the operator
              filling their tenth shipment of the day was reading past a
              paragraph to reach the list. */}
          <HelpHint label="How these are scored">
            {considerEmpties ? (
              <>
                Scored on the empty containers each carrier is already holding for this line and
                size, and on the empty returns already booked in their calendar around this pickup —
                either way the trip is one they are largely making anyway. Their star rating, fleet
                size and price make up the rest.
              </>
            ) : (
              <>
                This shipment carries no container to reuse, so carriers are scored on their star
                rating, fleet size and price alone.
              </>
            )}
          </HelpHint>
        </h4>
        <Badge variant="subtle" intent="default" size="sm">
          Top {top.length}
        </Badge>
      </div>

      {isLoading && considerEmpties ? (
        <p className="rounded-card-nested border border-dashed border-border bg-card px-4 py-3 text-[11px] text-muted-foreground">
          Checking which carriers are holding a container this shipment could take…
        </p>
      ) : (
        <>
          {considerEmpties && noEmptiesAnywhere && (
            <p className="rounded-card-nested border border-dashed border-border bg-card px-4 py-3 text-[11px] text-muted-foreground">
              No carrier is holding a container this shipment could reuse, so these are ranked on
              fleet and price alone.
            </p>
          )}

          <ol className="space-y-2">
            {top.map((entry, index) => (
              <RecommendationRow
                key={entry.partnerId}
                best={index === 0}
                entry={entry}
                assigned={assignedPartnerIds.includes(entry.partnerId)}
                onChoose={() => onChoose(entry.partnerId)}
              />
            ))}
            {top.length === 0 && (
              <li className="rounded-card-nested border border-dashed border-border bg-card px-4 py-3 text-[11px] text-muted-foreground">
                No transporters on the account yet.
              </li>
            )}
          </ol>
        </>
      )}

      <Button type="button" variant="outline" size="sm" className="w-full" onClick={onChooseManually}>
        Choose manually instead
      </Button>
    </div>
  );
}

function RecommendationRow({
  best,
  entry,
  assigned,
  onChoose,
}: {
  /** First in the ranking — the only position worth marking. */
  best: boolean;
  entry: TransporterScore;
  assigned: boolean;
  onChoose: () => void;
}) {
  /* The empties are the argument this panel exists to make; the fleet and the
     price are the context that stops it being a bad one. So they are typeset
     differently — one line in brand teal, one in muted small caps — rather than
     as four identical grey pills where the reader has to find the point. */
  const leadsWithEmpties = entry.emptiesHeld > 0 || entry.scheduledReturns > 0;
  const emptiesLine = [
    /* Spelled out rather than "boxes": this line answers "how many empty
       containers is this carrier holding that I could reuse", and the reader
       should not have to infer that "box" means container. */
    entry.emptiesHeld > 0
      ? `${entry.emptiesHeld} empty container${entry.emptiesHeld === 1 ? '' : 's'} held`
      : null,
    entry.urgent > 0 ? `${entry.urgent} due back in 3d` : null,
    /* The calendar signal, said plainly: they are already going. */
    entry.scheduledReturns > 0
      ? `${entry.scheduledReturns} return${entry.scheduledReturns === 1 ? '' : 's'} already booked`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const contextLine = [
    entry.coversFleet
      ? `${entry.vehicles} vehicles`
      : `only ${entry.vehicles} of ${entry.vehiclesNeeded} vehicles`,
    entry.ratePerVehicle > 0 ? `${entry.ratePerVehicle.toLocaleString()} FDJ` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li>
      <button
        type="button"
        onClick={onChoose}
        className={cn(
          /* `rounded-card-nested`, not an ad-hoc radius: these sit inside the
             wizard's own panel, and the design system's second rung is what a
             card nested in a card wears. */
          'group w-full cursor-pointer overflow-hidden rounded-card-nested border text-left transition-colors',
          assigned
            ? 'border-primary bg-primary-subtle'
            : best
              ? 'border-primary/40 bg-card hover:border-primary'
              : 'border-border/60 bg-card hover:border-primary/50',
        )}
      >
        {/* No rank numeral. The list is already in rank order and the score is
            printed on every row — a circled "4" beside them said nothing the
            reader could not see, and cost the logo its breathing room. */}
        <div className="flex items-center gap-3.5 px-4 py-3.5">
          <CompanyMark
            id={entry.partnerId}
            name={entry.name}
            logoUrl={entry.logoUrl ?? undefined}
            size="sm"
          />

          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-[13px] font-bold leading-tight text-foreground">
              <span className="truncate">{entry.name}</span>
              {assigned && <Check className="size-3.5 shrink-0 text-primary-bold" aria-label="Assigned" />}
              {/* One star and the figure, not five glyphs. The reader is
                  comparing five carriers down a narrow column: "4.2" is read at
                  a glance and sorts in the head, where five part-filled stars
                  have to be counted. Unrated carriers say so rather than
                  showing an empty star, which reads as a bad score. */}
              {entry.rating !== null ? (
                <span
                  className="ml-auto inline-flex shrink-0 items-center gap-0.5"
                  title={`Rated ${entry.rating.toFixed(1)} out of 5 on delivered bookings`}
                >
                  <Star aria-hidden className="size-3 fill-warning text-warning" />
                  <span className="font-mono text-[11px] font-bold tabular-nums text-foreground">
                    {entry.rating.toFixed(1)}
                  </span>
                </span>
              ) : (
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                  Not yet rated
                </span>
              )}
            </p>

            {/* The empty count is the whole reason this panel exists, so it is
                stated on every row — including zero. "Nothing of theirs on this
                route" hid the number behind a phrase and made a carrier holding
                none look like a carrier the engine had not checked. */}
            <p
              className={cn(
                'mt-1 flex items-center gap-1 text-[11px] leading-tight',
                leadsWithEmpties
                  ? 'font-semibold text-primary-bold'
                  : 'text-muted-foreground',
              )}
            >
              <PackageOpen className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">
                {entry.emptiesHeld > 0
                  ? emptiesLine
                  : entry.scheduledReturns > 0
                    ? emptiesLine
                    : '0 empty containers held'}
              </span>
            </p>

            <p
              className={cn(
                'mt-0.5 truncate text-[10.5px] uppercase tracking-[0.04em]',
                entry.coversFleet ? 'text-muted-foreground' : 'text-warning-subtle-foreground',
              )}
            >
              {contextLine}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p className="font-mono text-[22px] font-extrabold leading-none tracking-tight text-primary-bold">
              {entry.score}
              <span className="text-[13px] font-bold">%</span>
            </p>
            <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.11em] text-muted-foreground">
              {best ? 'Best match' : 'Match'}
            </p>
          </div>
        </div>

      </button>
    </li>
  );
}
