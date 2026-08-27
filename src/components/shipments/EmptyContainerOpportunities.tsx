import { useMemo } from 'react';

import { Badge, Button, Card, Checkbox } from '@/design-system';
import { AlertTriangle, ArrowLeftRight, Check, PackageOpen, Timer } from '@/design-system/icons';
import { resolveContainerSize } from '@/data/emptyReturnData';
import { useAvailableEmpties } from '@/features/empty-returns';
import type { EmptyReturnBookingRecord } from '@/features/empty-returns';
import { formatSpan, formatStamp } from '@/stores/emptyReturn.store';
import { CompanyMark } from '@/features/transporter-bi/cards/CompanyLabel';
import { cn } from '@/utils';

/**
 * "Which transporter is already holding a container this shipment can use?"
 *
 * The one thing Empty Container Management can tell the Shipment wizard that
 * the wizard could never work out for itself. Ordinarily a transporter is
 * chosen on price and availability; but a carrier who is *already sitting on an
 * empty box of the right line and size, near this pickup, with deadline to
 * spare* is strictly better than one who is not — assigning them turns two
 * trips into one, and the empty return that container was going to need simply
 * never happens.
 *
 * So this panel sits beside the transporter picker and does three things:
 *
 * 1. **Ranks the carriers** by how many compatible empties they are holding.
 * 2. **Shows the box itself** — number, line, size, where it is, and how much
 *    margin is left before its return deadline — so the operator can see the
 *    claim rather than trust a badge.
 * 3. **Lets them tick the ones to pair**, which are welded to the new
 *    shipment's own bookings the moment it is created.
 *
 * ## It never blocks
 *
 * A transporter with no compatible empty is still a perfectly good
 * transporter. Nothing here disables a choice, marks one wrong, or refuses a
 * submission — it is an argument, offered next to the decision, and the
 * operator is free to ignore it. Repositioning an empty truck is a normal
 * operation, not an error state.
 *
 * ## What "compatible" means, and why it is the same rule
 *
 * Same shipping line, same container size, the box is free before the truck is
 * needed, and this load is collected before the box's own return deadline.
 * Identical to the rule the Matching engine applies — a shipment created here
 * must not produce a pairing that Matching would have called impossible.
 */

export interface CompatibleEmpty {
  bookingId: string;
  bookingReference: string;
  container: string;
  line: string;
  size: string;
  location: string;
  partnerId: string;
  transporter: string;
  transporterLogoUrl?: string;
  deadline: number | null;
  /** Margin between this shipment's pickup and the box's return deadline. */
  marginMs: number | null;
  emptyReadyAt: number | null;
}

export interface TransporterOpportunity {
  partnerId: string;
  transporter: string;
  logoUrl?: string;
  empties: CompatibleEmpty[];
}

/** Compatible = same line, same size, free before pickup, collected before the deadline. */
function compatible(
  booking: EmptyReturnBookingRecord,
  params: { line: string; sizes: string[]; pickupAt: number },
): boolean {
  if (!booking.containerNumber) return false;
  if (!booking.partnerId) return false;
  // A box already flagged for its own return has been decided against; offering
  // it here would quietly overturn somebody else's call.
  if (booking.emptyReturnException) return false;
  if ((booking.shippingLine ?? '') !== params.line) return false;

  const size = resolveContainerSize(booking.shipmentCategory, booking.cargoType);
  if (!params.sizes.includes(size)) return false;

  const readyAt = booking.emptyReadyAt ? Date.parse(booking.emptyReadyAt) : null;
  if (readyAt !== null && readyAt > params.pickupAt) return false;

  const deadline = booking.containerReturnDeadline
    ? Date.parse(booking.containerReturnDeadline)
    : null;
  if (deadline === null) return false;
  return params.pickupAt <= deadline;
}

export interface EmptyContainerOpportunitiesProps {
  /** The shipping line this shipment's containers belong to. */
  line: string;
  /** Normalised container sizes on this shipment. */
  sizes: string[];
  /** Epoch ms — when the truck has to be at the pickup. */
  pickupAt: number;
  /** How many vehicles the shipment needs, so the panel can say whether one carrier covers it. */
  vehiclesNeeded: number;
  /** Partner ids currently assigned in the wizard. */
  assignedPartnerIds: string[];
  /** Booking ids of the empties the operator has ticked to pair. */
  selectedEmptyIds: string[];
  onSelectTransporter: (partnerId: string) => void;
  onToggleEmpty: (bookingId: string) => void;
}

export function EmptyContainerOpportunities({
  line,
  sizes,
  pickupAt,
  vehiclesNeeded,
  assignedPartnerIds,
  selectedEmptyIds,
  onSelectTransporter,
  onToggleEmpty,
}: EmptyContainerOpportunitiesProps) {
  const { data: available = [], isLoading } = useAvailableEmpties();

  const opportunities = useMemo<TransporterOpportunity[]>(() => {
    const matches = available.filter((booking) => compatible(booking, { line, sizes, pickupAt }));

    const byPartner = new Map<string, TransporterOpportunity>();
    for (const booking of matches) {
      const partnerId = booking.partnerId as string;
      const deadline = booking.containerReturnDeadline
        ? Date.parse(booking.containerReturnDeadline)
        : null;
      const entry: CompatibleEmpty = {
        bookingId: booking.id,
        bookingReference: booking.reference,
        container: booking.containerNumber ?? '',
        line: booking.shippingLine ?? line,
        size: resolveContainerSize(booking.shipmentCategory, booking.cargoType),
        location: booking.shipment?.deliveryLocationName || 'Location not recorded',
        partnerId,
        transporter: booking.partner?.companyLegalName ?? 'Unassigned',
        deadline,
        marginMs: deadline === null ? null : deadline - pickupAt,
        emptyReadyAt: booking.emptyReadyAt ? Date.parse(booking.emptyReadyAt) : null,
      };

      const bucket = byPartner.get(partnerId);
      if (bucket) bucket.empties.push(entry);
      else
        byPartner.set(partnerId, {
          partnerId,
          transporter: entry.transporter,
          empties: [entry],
        });
    }

    // Most boxes first, then the one with the most margin to play with — a
    // carrier holding three containers that all expire tonight is worse than
    // one holding two that expire next week.
    return [...byPartner.values()]
      .map((entry) => ({
        ...entry,
        empties: [...entry.empties].sort((a, b) => (b.marginMs ?? 0) - (a.marginMs ?? 0)),
      }))
      .sort(
        (a, b) =>
          b.empties.length - a.empties.length ||
          (b.empties[0]?.marginMs ?? 0) - (a.empties[0]?.marginMs ?? 0),
      );
  }, [available, line, sizes, pickupAt]);

  const total = opportunities.reduce((sum, entry) => sum + entry.empties.length, 0);
  const best = opportunities[0];
  /** Nobody alone covers the job — the reference's "split allocation" case. */
  const needsSplit = Boolean(best && best.empties.length < vehiclesNeeded && total > 0);

  if (isLoading) {
    return (
      <Card variant="flat" padding="sm">
        <p className="text-[11px] text-muted-foreground">
          Checking which transporters are holding a compatible empty container…
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <PackageOpen className="size-3.5 text-info" />
          Empty container optimisation
        </h4>
        {total > 0 ? (
          <Badge variant="subtle" intent="info" size="sm">
            {total} compatible empt{total === 1 ? 'y' : 'ies'} waiting
          </Badge>
        ) : (
          <Badge variant="subtle" intent="default" size="sm">
            None available
          </Badge>
        )}
      </div>

      {total === 0 ? (
        <Card variant="flat" padding="sm">
          <p className="text-[11px] text-muted-foreground">
            No transporter is currently holding a {line} {sizes.join(' / ')} empty that could be
            collected before its own return deadline. This is a standard operation — pick a
            transporter on availability as usual.
          </p>
        </Card>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">
            These transporters already have an empty container of the right line and size near this
            job. Assigning one turns two trips into one and removes an empty return.
          </p>

          {needsSplit && (
            <div className="flex items-start gap-2 rounded-md bg-warning-subtle p-2.5 text-[11px] text-warning-subtle-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                No single transporter holds {vehiclesNeeded} compatible empt
                {vehiclesNeeded === 1 ? 'y' : 'ies'}. Split the job across the carriers below, or
                accept that the rest are standard repositioning trips.
              </span>
            </div>
          )}

          {opportunities.map((entry, index) => {
            const assigned = assignedPartnerIds.includes(entry.partnerId);
            const recommended = index === 0;
            return (
              <Card
                key={entry.partnerId}
                variant="flat"
                padding="sm"
                className={cn(
                  assigned && 'border-primary bg-primary-subtle/40',
                  !assigned && recommended && 'border-primary/50',
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <CompanyMark
                    id={entry.partnerId}
                    name={entry.transporter}
                    logoUrl={entry.logoUrl}
                    size="xs"
                  />
                  <span className="text-sm font-bold text-foreground">{entry.transporter}</span>
                  {recommended && !assigned && (
                    <Badge variant="subtle" intent="primary" size="sm">
                      Recommended
                    </Badge>
                  )}
                  {assigned && (
                    <Badge variant="subtle" intent="primary" size="sm">
                      <Check className="size-3" /> Assigned
                    </Badge>
                  )}
                  <Badge variant="subtle" intent="info" size="sm">
                    {entry.empties.length} compatible empt
                    {entry.empties.length === 1 ? 'y' : 'ies'}
                  </Badge>
                  {!assigned && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      className="ml-auto"
                      onClick={() => onSelectTransporter(entry.partnerId)}
                    >
                      Assign
                    </Button>
                  )}
                </div>

                {recommended && !assigned && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    <b className="text-primary">Why recommended?</b> They are already holding a
                    compatible empty container with the most deadline margin of anyone available.
                  </p>
                )}

                <ul className="mt-2 space-y-1.5">
                  {entry.empties.map((empty) => {
                    const ticked = selectedEmptyIds.includes(empty.bookingId);
                    const tight = empty.marginMs !== null && empty.marginMs < 6 * 3_600_000;
                    return (
                      <li
                        key={empty.bookingId}
                        className="flex flex-wrap items-start gap-2 rounded-md border border-dashed border-info bg-surface px-2.5 py-1.5"
                      >
                        <Checkbox
                          checkboxSize="sm"
                          checked={ticked}
                          onChange={() => onToggleEmpty(empty.bookingId)}
                          aria-label={`Pair ${empty.container} with this shipment`}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-xs font-bold tabular-nums text-foreground">
                              {empty.container}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {empty.line} · {empty.size}
                            </span>
                          </div>
                          <div className="text-[10px] text-muted-foreground">{empty.location}</div>
                          <div className="flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
                            <span>
                              Return deadline{' '}
                              <span className="font-mono font-semibold">
                                {formatStamp(empty.deadline)}
                              </span>
                            </span>
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 font-semibold',
                                tight
                                  ? 'text-warning-subtle-foreground'
                                  : 'text-success-subtle-foreground',
                              )}
                            >
                              <Timer className="size-3" />
                              {empty.marginMs === null
                                ? '—'
                                : `+${formatSpan(empty.marginMs)} margin`}
                              {tight ? ' (tight)' : ''}
                            </span>
                          </div>
                        </div>
                        {ticked && (
                          <Badge variant="subtle" intent="primary" size="sm">
                            <ArrowLeftRight className="size-3" /> Will pair
                          </Badge>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}

          <p className="text-[10px] text-muted-foreground">
            A ticked container is paired with one of this shipment&rsquo;s own bookings the moment
            it is created — the same pairing the Matching workbench would make, recorded without a
            second trip through it. Ticking nothing is a normal shipment.
          </p>
        </>
      )}
    </div>
  );
}
