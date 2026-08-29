import { useState } from 'react';

import {
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconChip,
  Input,
} from '@/design-system';
import { Check, CheckCircle2, Clock, Package } from '@/design-system/icons';
import { BOOKING_LADDER } from '@/features/bookings/api/bookingsService';
import { useSettleBookingStatus, useUpdateBookingStatus } from '@/features/bookings/api/queries';
import { containerStateOf, type ContainerState } from '@/lib/containerState';
import { displayShipmentStatus, shipmentStepsFor, stepRungFor } from '@/lib/shipmentStatus';
import { cn } from '@/utils';

/**
 * Change a booking's status without leaving the card it is printed on.
 *
 * The ladder used to live only inside the preview sheet, so moving one booking
 * one rung meant opening a side panel, finding the picker, closing the panel —
 * for the single most frequent action in the app. This is the same control, the
 * same rules and the same write path, sized to sit on a card.
 *
 * ## It is a plain select, on purpose
 *
 * The whole ladder, every time, with the unreachable rungs disabled and the
 * reason printed on them. Not "advance / revert": a dispatcher knows where the
 * container is, and asking them to classify their own correction as a
 * correction is a question about the software, not about the container.
 *
 * ## It costs no space
 *
 * The menu hangs off whatever trigger the host passes in — normally the status
 * badge the card was already printing. A full-width control on its own row was
 * tried first and was the loudest thing on a card whose job is to show a driver
 * and a truck. The badge already says the status; making it the control adds an
 * affordance, not a row.
 *
 * ## The app's own menu, not the operating system's
 *
 * A transparent native `<select>` over the badge was the first cut, and it
 * bought the keyboard and the phone's picker wheel for free — but it opened a
 * macOS system menu in the middle of Fleetin, in a different typeface, with no
 * room for a disabled rung's reason. The design system's `DropdownMenu` is
 * Radix underneath, so the keyboard and the screen reader still work, and the
 * menu is finally the product's.
 */

/**
 * The backend's error text, in the operator's own vocabulary.
 *
 * Its messages name rungs (`Loaded`, `Arrived`, `POD Submitted`); the picker
 * names moments (`Picked Up`, `Delivered`, `Depotage`). Printing the first at
 * someone who chose the second is how a refusal becomes a mystery.
 */
function speakInLabels(message: string): string {
  /* Longest first: replacing "Assigned" before "Driver Assigned" would rewrite
     the tail of the longer rung and leave "Driver <label>" behind. */
  return [...BOOKING_LADDER]
    .sort((a, b) => b.length - a.length)
    .reduce((text, rung) => text.split(rung).join(displayShipmentStatus(rung)), message);
}

/**
 * The dot each rung wears in the menu.
 *
 * These are the *container-state* colours — the app's normalised pair, teal
 * while the box is full, amber once it is empty, grey once it is home — and
 * they are the same tokens the badge on the card is painted with. A first cut
 * coloured the rungs by `statusIntentOf` instead, which is a different
 * three-colour system: the menu offered a blue "Delivered" and picking it
 * produced a teal badge, so the control and its own result disagreed.
 */
const CONTAINER_STATE_DOT: Record<ContainerState, string> = {
  full: 'bg-container-full',
  empty: 'bg-container-empty',
  returned: 'bg-container-returned',
};

/** Rungs that only exist for a booking that actually carries a box. */
const EMPTY_RETURN_RUNGS = ['Empty Ready', 'Empty Picked Up'];

export interface BookingStatusPickerBooking {
  id: string;
  status: string;
  containerNumber?: string;
  driverId?: string;
  vehicleId?: string;
  driverName?: string;
  vehicleNumber?: string;
}

export function BookingStatusPicker({
  booking,
  onChanged,
  className,
  children,
}: {
  booking: BookingStatusPickerBooking;
  /** Fired with the rung actually reached, so the host can patch its own row. */
  onChanged?: (status: string) => void;
  className?: string;
  /** The visible trigger — the select lays itself invisibly over this. */
  children: React.ReactNode;
}) {
  const updateBookingStatus = useUpdateBookingStatus();
  const settle = useSettleBookingStatus();
  const [pending, setPending] = useState<{ target: string; date: string; time: string } | null>(
    null,
  );
  const [error, setError] = useState('');

  const hasContainer = Boolean(booking.containerNumber);
  const hasDriver = Boolean(booking.driverId) || Boolean(booking.driverName?.trim());
  const hasVehicle = Boolean(booking.vehicleId) || Boolean(booking.vehicleNumber?.trim());

  /**
   * Two different lists, and conflating them was a real bug.
   *
   * `steps` is what the operator picks between — seven named moments. `ladder`
   * is the backend's full chain, which has rungs the picker never shows
   * (`Assigned`, `At Pickup`, `Loading`…). Walking the *display* list meant
   * `Pending → Loaded` skipped `Assigned`, and the backend refused the edge:
   * "Cannot move a booking from Pending to Loaded". The walk has to use the
   * real chain; only the options come from the steps.
   */
  const steps = shipmentStepsFor(hasContainer);
  const ladder = hasContainer
    ? BOOKING_LADDER
    : BOOKING_LADDER.filter((rung) => !EMPTY_RETURN_RUNGS.includes(rung));
  const currentStep = stepRungFor(booking.status);

  /* Terminal states are not rungs — a closed booking has no next step, and the
     backend never walks back out of one. */
  const closed = ['Cancelled', 'Failed', 'Completed'].includes(booking.status);

  const requirementFor = (status: string): string | null => {
    if (status === 'Driver Assigned' && !hasDriver) return 'assign a driver first';
    if ((status === 'Heading to Pickup' || status === 'En Route') && !hasVehicle)
      return 'assign a vehicle first';
    if (status === 'Completed' && !hasVehicle) return 'assign a vehicle first';
    return null;
  };

  /**
   * The rungs actually written to reach `target`.
   *
   * Backwards is one write — the backend takes a lower rung as a correction.
   * Forwards is every rung in between, because each one is a real event with
   * its own timeline stamp, and skipping them skips their guards too.
   */
  const ladderPathTo = (target: string): string[] => {
    const from = ladder.indexOf(booking.status);
    const to = ladder.indexOf(target);
    if (from < 0 || to < 0 || to < from) return [target];
    return ladder.slice(from + 1, to + 1);
  };

  const blockerFor = (target: string): { requirement: string } | null => {
    for (const status of ladderPathTo(target)) {
      const requirement = requirementFor(status);
      if (requirement) return { requirement };
    }
    return null;
  };

  const openPicker = (target: string) => {
    if (!target || target === booking.status) return;
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    setError('');
    setPending({
      target,
      date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    });
  };

  const commit = async () => {
    if (!pending) return;
    const at = new Date(`${pending.date}T${pending.time}`);
    if (Number.isNaN(at.getTime())) {
      setError('That date and time could not be read.');
      return;
    }
    const occurredAt = at.toISOString();
    let reached = booking.status;
    try {
      for (const status of ladderPathTo(pending.target)) {
        await updateBookingStatus.mutateAsync({ id: booking.id, status, occurredAt });
        reached = status;
      }
      setPending(null);
      onChanged?.(reached);
    } catch (caught) {
      /* The backend reports in raw rungs — "Cannot move a booking from Pending
         to Loaded" — while the picker offered "Created" and "Picked Up". Same
         two states, two vocabularies, and the reader is left to bridge them.
         Rewrite the rungs into the words they just clicked. */
      setError(speakInLabels(caught instanceof Error ? caught.message : 'The status could not be updated.'));
      if (reached !== booking.status) onChanged?.(reached);
    } finally {
      /* Once, after the last rung — never inside the loop. Re-reading between
         PATCHes is what used to overwrite the card with a status it had already
         moved past. Runs on a half-written walk too, since the rungs that did
         land still moved the shipment and the cycle. */
      if (reached !== booking.status) settle();
    }
  };

  /* A closed booking still shows its badge — it simply stops being a control. */
  if (closed) return <>{children}</>;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={updateBookingStatus.isPending}>
          <button
            type="button"
            aria-label={`Status for booking ${booking.id}`}
            /* The card is a click target of its own, and it listens on `click`
               while Radix opens on `pointerdown` — so stopping only the click
               let the press through and the side sheet opened *behind* the
               menu. Both have to be stopped. */
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            className={cn(
              'cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed',
              className,
            )}
          >
            {children}
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64" onClick={(e) => e.stopPropagation()}>
          {steps.map((step, index) => {
            const isCurrent = step.rung === currentStep;
            const blocker = isCurrent ? null : blockerFor(step.rung);
            return (
              <DropdownMenuItem
                key={step.rung}
                disabled={Boolean(blocker)}
                onSelect={() => openPicker(step.rung)}
                className="flex items-start gap-2"
              >
                <span className="w-3.5 shrink-0 pt-0.5 text-center font-mono text-[10px] text-muted-foreground">
                  {isCurrent ? <Check className="size-3.5 text-primary-bold" /> : index + 1}
                </span>
                {(() => {
                  const state = containerStateOf(step.rung, hasContainer);
                  return (
                    <span
                      aria-hidden
                      className={cn(
                        'mt-1 size-2 shrink-0 rounded-full',
                        state ? CONTAINER_STATE_DOT[state] : 'bg-border-strong',
                        blocker && 'opacity-40',
                      )}
                    />
                  );
                })()}
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-xs', isCurrent && 'font-bold text-foreground')}>
                    {step.label}
                  </span>
                  {/* The reason lives under the rung it blocks. A disabled row
                      with no explanation is a dead end the reader has to guess
                      their way out of. */}
                  {blocker && (
                    <span className="mt-0.5 block text-[10.5px] leading-tight text-muted-foreground">
                      {blocker.requirement}
                    </span>
                  )}
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* ── WHEN DID THIS HAPPEN? ──
          Every report computes its durations from this timestamp, so the moment
          the operator reports is the only one worth storing — the moment they
          typed it tells you about the office, not the run. */}
      {pending && (
        <div
          className="fixed inset-0 z-modal flex items-center justify-center bg-overlay/70 p-4 backdrop-blur-[2px]"
          onClick={(event) => event.stopPropagation()}
        >
          <Card className="w-full max-w-xs space-y-3 rounded-card border border-border bg-card p-4 shadow-lg">
            <div className="flex items-start gap-3">
              <IconChip
                icon={
                  pending.target === 'Completed'
                    ? CheckCircle2
                    : pending.target.startsWith('Empty')
                      ? Package
                      : Clock
                }
                size={36}
              />
              <div className="min-w-0">
                <p className="text-sm font-bold leading-tight text-foreground">
                  {displayShipmentStatus(pending.target)}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  When did this actually happen?
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={pending.date}
                onChange={(event) => setPending({ ...pending, date: event.target.value })}
              />
              <Input
                type="time"
                value={pending.time}
                onChange={(event) => setPending({ ...pending, time: event.target.value })}
              />
            </div>

            {error && <p className="text-[11px] text-destructive">{error}</p>}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                size="sm"
                disabled={updateBookingStatus.isPending}
                onClick={() => setPending(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1"
                size="sm"
                disabled={updateBookingStatus.isPending}
                onClick={() => void commit()}
              >
                {updateBookingStatus.isPending ? 'Saving…' : 'Record'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
