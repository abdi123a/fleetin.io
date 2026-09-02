import { useMemo, useState } from 'react';

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
import {
  CheckCircle2,
  Circle,
  CircleArrowRight,
  CircleCheck,
  Clock,
  Package,
} from '@/design-system/icons';
import { BOOKING_LADDER } from '@/features/bookings/api/bookingsService';
import { useSettleBookingStatus, useUpdateBookingStatus } from '@/features/bookings/api/queries';
import { useDocuments } from '@/features/documents/api/queries';
import { uploadDocuments } from '@/features/documents/api/documentsService';
import { ProofFileField } from '@/features/documents/components/ProofFileField';
import { proofsRequiredForWalk, type ProofRequirement } from '@/features/documents/proofRequirement';
import type { StatusIntent } from '@/design-system/primitives/Layout/statusIntent';
import { statusIntentOf } from '@/lib/shipmentStatus';
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
 * Where the box stops being full.
 *
 * Named once, here, rather than as an index into the step list: the ladder has
 * gained rungs twice, and a `slice(0, 4)` would have silently re-cut the legs
 * in the wrong place both times.
 */
const EMPTY_LEG_FROM = 'Empty Ready';



/**
 * The rail beside a leg of the ladder.
 *
 * Three cuts to get here. A hairline bracket read as a stray box — thin grey
 * lines and 9px grey type are what the eye skips. A plain rail fixed the colour
 * but lost the ends: a straight line says "these belong together" without
 * saying where the group starts and stops. This is the bracket again, drawn at
 * 2px in the colour of the thing it is naming.
 *
 * ## And the thing it names is the CONTAINER
 *
 * Not the phase. The label reads "FULL CONTAINER" and "EMPTY CONTAINER", so it
 * takes the container scale the rest of the app paints boxes in — teal full,
 * amber empty, the same two colours as the FULL/EMPTY tag on the card this
 * menu hangs off. It was drawn in the ladder's green, which meant the words
 * "FULL CONTAINER" appeared in green beside a container tagged teal for being
 * full: one fact, two colours, on one screen.
 *
 * `items-stretch` on the row is what makes the rail exactly as tall as the
 * rungs it holds, at any number of them.
 */
function LegBrace({ label, tone }: { label: string; tone: 'full' | 'empty' }) {
  return (
    <span aria-hidden className="flex shrink-0 items-stretch gap-1.5 py-[3px] pl-1.5 pr-1">
      {/* A rounded bracket with arms that fade out.
       *
       * Two parts, because neither can do the other's job. The bracket itself
       * is a bordered box with a corner radius — that is what gives the turns a
       * curve instead of a mitre, and a border is the only way to get one. The
       * arms are separate gradient bars continuing from where its own arms end,
       * because a border cannot fade: hard arms stopped dead in the middle of
       * the row like two stray dashes, and these dissolve into the empty side
       * of the rungs instead, so the line never has to decide how close to the
       * words it is allowed to get. Same 2px, flush, so the join is invisible. */}
      <span className="relative w-3">
        <span
          className={cn(
            'block h-full w-full rounded-r-lg border-y-2 border-r-2',
            tone === 'full' ? 'border-container-full' : 'border-container-empty',
          )}
        />
        <span
          className={cn(
            'absolute -left-8 top-0 h-[2px] w-8 bg-gradient-to-l to-transparent',
            tone === 'full' ? 'from-container-full' : 'from-container-empty',
          )}
        />
        <span
          className={cn(
            'absolute -left-8 bottom-0 h-[2px] w-8 bg-gradient-to-l to-transparent',
            tone === 'full' ? 'from-container-full' : 'from-container-empty',
          )}
        />
      </span>
      {/* Two turned lines in ONE text block, absolutely placed.
       *
       * Absolute, because laid out in flow the words drove the height: "Empty
       * container" is 109px of turned type and the leg it brackets is 78px of
       * rows, so the row grew to fit the words and the amber bracket ran past
       * the last rung it was holding. The bracket measures the rungs now.
       *
       * One block with a line break, because two separately positioned columns
       * overlapped: a turned line box is wider than the font size, so each spilled
       * into the other and printed "FCUOLNLTAINER". Let the browser lay the two
       * lines out and it spaces them itself — `leading` is the gap between the
       * columns, and `text-center` centres them along the leg. */}
      <span className="relative w-[27px]">
        <span
          className={cn(
            'absolute inset-0 whitespace-nowrap text-center text-[8.5px] font-extrabold uppercase leading-[1.5] tracking-[0.05em] [writing-mode:vertical-rl]',
            tone === 'full' ? 'text-container-full' : 'text-container-empty-subtle-foreground',
          )}
        >
          {label}
          <br />
          <span className="font-bold opacity-70">Container</span>
        </span>
      </span>
    </span>
  );
}

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
 * These are the ladder's own **phase** colours, the same four `statusIntentOf`
 * paints the badge with: teal booked, green in transit, amber owing a return,
 * slate closed. The menu and its own result therefore agree — picking a green
 * "Delivered" produces a green badge.
 *
 * Two of those phases cover two rungs, and this is the one place where that
 * matters most: a menu exists to be chosen from, so "which of these two am I
 * on?" is the question it has to answer. Picked Up and Delivered are both
 * green, Empty Ready and Empty Picked Up are both amber, and in each pair the
 * later rung is one step deeper on the same ramp. Hue still says the phase;
 * depth says how far into it.
 *
 * An earlier cut used `statusIntentOf` when it still returned blue for the
 * three transit rungs, and a later one used the container-state pair to fix the
 * resulting disagreement. Both were solving the same problem from opposite
 * ends; the ladder now has one colour system and the dot simply reads it.
 */
const STEP_DOT: Record<StatusIntent, string> = {
  teal: 'bg-primary',
  green: 'bg-success',
  'green-deep': 'bg-success-deep',
  orange: 'bg-accent',
  'orange-deep': 'bg-warning-deep',
  blue: 'bg-info',
  red: 'bg-destructive',
  slate: 'bg-secondary-foreground/40',
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
  /**
   * The empty return's own crew, when it is not the delivery crew.
   *
   * The picker needs the id to know whether a second person is owed a debrief
   * at all, and the name to put on that debrief — a dialog awarding stars has
   * to say whose record they land on.
   */
  returnDriverId?: string;
  returnVehicleId?: string;
  returnDriverName?: string;
  returnVehicleNumber?: string;
  /** The shipper this container belongs to — who the closing debrief is about. */
  shipperCompany?: string;
  /** Whose fleet the return crew is picked from. */
  partnerId?: string;
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

  /**
   * The delivery debrief.
   *
   * Marking a booking Delivered is the one moment somebody has just watched the
   * job finish, so it is the only moment they can say how it went. Asked here
   * rather than left to a screen nobody revisits — a rating that has to be
   * hunted for is a rating that never gets written.
   *
   * Not folded into the computed star (`@/lib/rating`), which is derived from
   * timestamps and says so; this is stored beside it as the human read.
   */
  const [pending, setPending] = useState<{ target: string; date: string; time: string } | null>(
    null,
  );
  const [error, setError] = useState('');

  /**
   * The paperwork this walk owes, keyed by category.
   *
   * Held beside the date and the time because it is the same report: the
   * operator marking a container delivered is the person holding the signed
   * note, and asking them for it on a different screen, later, means asking
   * somebody else for paper they never had.
   */
  const [proofFiles, setProofFiles] = useState<Record<string, File[]>>({});
  const [uploading, setUploading] = useState(false);

  /* What is already on file. A booking being re-recorded — a corrected
     timestamp, a walk that failed halfway — must not be made to upload its
     delivery note a second time. */
  const { data: bookingDocuments = [] } = useDocuments('BOOKING', booking.id);

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

  /**
   * The ladder split where the box is emptied.
   *
   * `Empty Ready` is the rung the whole app turns on: it is where
   * `containerStateOf` flips a container from full to empty, where the
   * detention clock starts, and where these dots stop being green and go
   * amber. So it is the honest place to cut the list in two — everything above
   * it happens with the cargo still inside, everything from it happens to an
   * empty box. A load with no container never reaches that rung, so it stays
   * one unlabelled list rather than being braced as "full" for its whole life.
   */
  const legs = useMemo(() => {
    const numbered = steps.map((step, index) => ({ step, index }));
    const split = numbered.findIndex(({ step }) => step.rung === EMPTY_LEG_FROM);
    if (split <= 0) return [{ label: null, tone: 'full' as const, steps: numbered }];
    return [
      { label: 'Full', tone: 'full' as const, steps: numbered.slice(0, split) },
      { label: 'Empty', tone: 'empty' as const, steps: numbered.slice(split) },
    ];
  }, [steps]);
  const ladder = hasContainer
    ? BOOKING_LADDER
    : BOOKING_LADDER.filter((rung) => !EMPTY_RETURN_RUNGS.includes(rung));
  const currentStep = stepRungFor(booking.status);
  /* Which rungs are behind the booking. A menu that marks only where you ARE
     leaves the rest looking identical — the four steps already walked and the
     three still to come read the same, and the one question somebody opens
     this list with is "how far has this got". */
  const currentIndex = steps.findIndex((step) => step.rung === currentStep);

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
    setProofFiles({});
    setPending({
      target,
      date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    });
  };

  /**
   * The proofs this click still owes.
   *
   * Computed over the whole WALK, not the target rung: choosing "Empty
   * Returned" from "Picked Up" passes through the delivery *and* the return,
   * and asking for only the last of them would leave the walk refused halfway
   * with three rungs already written. Anything already on file drops out —
   * the guard counts documents, not uploads.
   */
  const outstandingProofs: ProofRequirement[] = pending
    ? proofsRequiredForWalk(ladderPathTo(pending.target), hasContainer).filter(
        (proof) => !bookingDocuments.some((document) => document.category === proof.category),
      )
    : [];

  const commit = async () => {
    if (!pending) return;
    const at = new Date(`${pending.date}T${pending.time}`);
    if (Number.isNaN(at.getTime())) {
      setError('That date and time could not be read.');
      return;
    }

    const unproven = outstandingProofs.find((proof) => (proofFiles[proof.category] ?? []).length === 0);
    if (unproven) {
      setError(unproven.missing);
      return;
    }

    const occurredAt = at.toISOString();
    let reached = booking.status;

    /* Files first, rungs second, and never the other way round.
     *
     * The backend refuses the rung until the document exists, so uploading
     * after the walk would refuse the walk that was meant to carry the upload.
     * An upload that lands and a walk that then fails leaves a real document on
     * a booking that did not move — which is recoverable, and the right way
     * round: the paper is evidence either way. */
    try {
      setUploading(true);
      for (const proof of outstandingProofs) {
        await uploadDocuments({
          ownerType: 'BOOKING',
          ownerId: booking.id,
          category: proof.category,
          files: proofFiles[proof.category] ?? [],
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The document could not be filed.');
      setUploading(false);
      return;
    }
    setUploading(false);

    try {
      for (const status of ladderPathTo(pending.target)) {
        await updateBookingStatus.mutateAsync({ id: booking.id, status, occurredAt });
        reached = status;
      }
      setPending(null);
      onChanged?.(reached);
      /* No debrief from here. The page watches the rows and asks once, however
         the booking got closed — including the empty-return match, which closes
         it without touching this control at all. */
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
          {/* The ladder in two legs.
           *
           * Seven rungs read as one long list, and the single most important
           * thing about them is invisible in that form: rungs 1–4 happen with
           * the cargo still in the box, rungs 5–7 happen after it has been
           * stripped. That is the same full → empty axis the container tag on
           * the card wears, and the dots already change colour on `Empty
           * Ready` — the rail names the change instead of leaving the reader to
           * infer it from a hue.
           *
           * A bulk load has no second leg (it is tipped, not stripped), so it
           * gets the plain list and no rail at all. */}
          {legs.map((leg) => (
            <div key={leg.label ?? 'all'} className="flex items-stretch">
              <div className="min-w-0 flex-1">
                {leg.steps.map(({ step, index }) => {
                  const isCurrent = step.rung === currentStep;
                  const isDone = currentIndex >= 0 && index < currentIndex;
                  /* The ladder's own colour system, not a second list here:
                     `STEP_INTENT` gives Unstuffing red, and this rung wears it
                     until it has been walked. A warning about something already
                     done is just noise, so a done rung goes quiet like any
                     other. */
                  const isAttention = !isDone && statusIntentOf(step.rung) === 'red';
                  const blocker = isCurrent ? null : blockerFor(step.rung);
                  return (
                    <DropdownMenuItem
                      key={step.rung}
                      disabled={Boolean(blocker)}
                      onSelect={() => openPicker(step.rung)}
                      /* `[&>span>svg]` beats the menu's own
                         `[&_svg]:text-muted-foreground` and `[&_svg]:size-4` on
                         specificity — without it every marker in here came out
                         grey and a size too big, which is why the tick and the
                         clock were barely visible. The wrapper carries the
                         colour and the glyph inherits it. */
                      className="items-start gap-2.5 py-1 [&>span>svg]:size-4 [&>span>svg]:text-current"
                    >
                      {/* Both marks sit in a box the height of one line of the
                          label, so they centre on the rung's own text instead
                          of being nudged into place with `mt-` guesses — which
                          is what left the numbers and dots looking a pixel out
                          on every row. */}
                      {/* One family of marks, three states — the ring is the
                          constant and what is inside it is the message: ticked
                          for a rung already walked, an arrow for the one the
                          booking is standing on, hollow for the ones ahead.
                          Numbers said the same thing in a weaker way, and they
                          made a walked rung and an unreached one look
                          identical. */}
                      <span
                        className={cn(
                          'flex h-5 w-4 shrink-0 items-center justify-center',
                          isDone
                            ? 'text-success'
                            : isCurrent
                              ? 'text-primary-bold'
                              : 'text-border-strong',
                        )}
                      >
                        {isDone ? (
                          /* Filled, not outlined. A walked rung is settled, and
                             a solid disc with the mark cut out of it in white
                             says that at a glance where a hollow ring reads as
                             one more empty checkbox — the same filled-disc
                             idiom `RecordStatus` uses for its marks. */
                          <CircleCheck className="fill-success stroke-white" />
                        ) : isCurrent ? (
                          <CircleArrowRight />
                        ) : (
                          <Circle />
                        )}
                      </span>
                      <span className="flex h-5 shrink-0 items-center">
                        <span
                          aria-hidden
                          className={cn(
                            'size-2 rounded-full',
                            isAttention ? 'bg-destructive' : STEP_DOT[statusIntentOf(step.rung)],
                            blocker && 'opacity-40',
                          )}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        {/* `whitespace-nowrap`: "Empty Picked Up" broke over two
                            lines and knocked that rung out of the rhythm every
                            other one keeps. A rung name is a label, not prose —
                            it gets a line each, and the menu is sized to hold
                            the longest of them. */}
                        <span
                          className={cn(
                            'block whitespace-nowrap text-[13px] leading-5',
                            /* Weight and colour decided separately, and each in
                               ONE branch: two competing text-colour utilities
                               on the same element are settled by Tailwind's own
                               output order, not by the order they are written
                               here — which is a coin toss dressed as code. */
                            isCurrent ? 'font-bold' : 'font-medium',
                            isDone
                              /* Done recedes: it has happened, and the rungs
                                 that have not are what the reader is choosing
                                 between. */
                              ? 'text-muted-foreground'
                              : isAttention
                                ? 'text-destructive'
                                : isCurrent
                                  ? 'text-foreground'
                                  : 'text-foreground/90',
                          )}
                        >
                          {step.label}
                        </span>
                        {/* The reason lives under the rung it blocks. A disabled
                            row with no explanation is a dead end the reader has
                            to guess their way out of. */}
                        {blocker && (
                          <span className="mt-0.5 block text-[10.5px] leading-tight text-muted-foreground">
                            {blocker.requirement}
                          </span>
                        )}
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </div>
              {leg.label ? <LegBrace label={leg.label} tone={leg.tone} /> : null}
            </div>
          ))}
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
          <Card className="max-h-[calc(100vh-2rem)] w-full max-w-xs space-y-3 overflow-y-auto rounded-card border border-border bg-card p-4 shadow-lg">
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

            {/* ── AND WHAT PROVES IT? ──
                The two rungs nobody may claim on their own word. The cargo
                reaching the consignee releases the container and the payout;
                the empty reaching the depot stops detention and closes the job.
                Both are asked for here, in the dialog that records the moment,
                so the file and the timestamp are one action rather than two
                screens and a refusal in between. */}
            {outstandingProofs.map((proof) => (
              <div key={proof.category} className="space-y-1.5 border-t border-border/60 pt-3">
                <div>
                  <p className="text-xs font-bold leading-tight text-foreground">{proof.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{proof.hint}</p>
                </div>
                <ProofFileField
                  files={proofFiles[proof.category] ?? []}
                  disabled={uploading || updateBookingStatus.isPending}
                  onChange={(files) => {
                    setProofFiles((held) => ({ ...held, [proof.category]: files }));
                    setError('');
                  }}
                />
              </div>
            ))}

            {error && <p className="text-[11px] text-destructive">{error}</p>}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                size="sm"
                disabled={updateBookingStatus.isPending || uploading}
                onClick={() => setPending(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1"
                size="sm"
                disabled={updateBookingStatus.isPending || uploading}
                onClick={() => void commit()}
              >
                {uploading ? 'Filing…' : updateBookingStatus.isPending ? 'Saving…' : 'Record'}
              </Button>
            </div>
          </Card>
        </div>
      )}

    </>
  );
}
