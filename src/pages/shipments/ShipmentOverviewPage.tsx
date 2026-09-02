import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import {
  ArrowLeftRight,
  ArrowLeftToLine,
  FolderOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Package,
  PackageCheck,
  Route,
} from '@/design-system/icons';
import {
  Badge,
  Button,
  Card,
  ContainerStateTag,
  CornerBadge,
  IconChip,
  MARK_STACK_OVERLAP,
  Tooltip,
  VerificationBadge,
} from '@/design-system';
import { ROUTES } from '@/config/routes';
import { useEmptyReturnStore } from '@/stores/emptyReturn.store';
import { cn, isDriverVerified } from '@/utils';
import { BookingPreviewSheet, type BookingPreviewItem } from './components';
import { emptyReturnStageOf, type EmptyReturnStage } from '@/features/empty-returns/returnStage';
import { CrewPicker, CrewStack } from '@/components/crew';
import {
  BookingDebriefDialog,
  debriefSubjectsFor,
  emptyDebrief,
  type DebriefDraft,
  type DebriefSubject,
} from '@/components/bookings';
import { RecordRaise, RecordTickets } from '@/features/workspace';
import { Co2CardStrip } from '@/features/emissions';
import { useSetShipmentCrew, useShipment, useShipmentRaw } from '@/features/shipments/api/queries';
import { markShipmentSeen } from '@/features/shipments/seenShipments';
import { useBookingsForShipment } from '@/features/bookings/api/queries';
import { ShipmentReportPanel } from '@/components/reports';
import { type BookingRecord } from '@/features/bookings/api/bookingsService';
import {
  displayShipmentStatus,
  shipmentProgress,
  statusBadgeIntentOf,
  statusCornerIntentOf,
  statusIntentOf,
  statusPhaseOf,
} from '@/lib/shipmentStatus';
import { BookingStatusPicker } from './components/BookingStatusPicker';
import {
  carriesContainer,
  allContainersReturned,
  containerStateOf,
  type ContainerState,
} from '@/lib/containerState';
import { useCycles } from '@/features/empty-returns/api/queries';
import type { EmptyReturnCycleRecord } from '@/features/empty-returns/api/emptyReturnsService';
import { useProject } from '@/features/finance';
import { CompanyMark } from '@/features/transporter-bi/cards/CompanyLabel';

/**
 * Booking cards per page.
 *
 * Six, because the grid is one column on mobile, two at `sm` and three at `lg`:
 * six divides by all three, so a page never ends in a ragged row. It was three,
 * which sent the fourth container of a four-container shipment to page two and
 * left a hole beside the third.
 */
const PAGE_SIZE = 6;

/**
 * Compact mark for the booking card's own row — the full sentence lives in the
 * preview sheet's Empty Return card.
 *
 * **A glyph appears once the return has been decided, and not before.** Paired
 * with an inbound load, or going back on its own: both are decisions somebody
 * made, and both are worth seeing without reading. "No return booked" stays
 * bare, because nothing has happened to draw.
 *
 * `ArrowLeftRight` is not a fresh choice — it is the mark the Empty Container
 * module already uses for a pairing, on the flow diagram's PAIRED connector and
 * on the "Open in Matching" button. Confirming a pairing should leave the same
 * mark on the booking it was confirmed for, or the two screens are describing
 * one decision with two vocabularies.
 */
const EMPTY_RETURN_STAGE_MARK: Record<
  EmptyReturnStage,
  { label: string; icon?: typeof ArrowLeftRight }
> = {
  awaiting_empty: { label: 'Still loaded' },
  /* Not a label — a door. See the button that renders this stage below: a
     container nobody has booked a return for is the one state on this card that
     is asking somebody to DO something, and "No return booked" only described
     the hole. */
  waiting_match: { label: 'Book return', icon: ArrowLeftRight },
  /* Was "In progress", which said nothing: everything on this page is in
     progress. The fact worth printing is that the box has a ride home — it is
     paired with an inbound full load and travelling to the depot. "Return
     booked" is the Empty Container module's own words for the same state on
     its calendar legend, so the two read alike. */
  matched: { label: 'Heading back', icon: ArrowLeftRight },
  returned: { label: 'Returned', icon: PackageCheck },
  /* Not the pairing arrow: this box is going back on its own, which is the
     one outcome the module exists to avoid. */
  standalone: { label: 'Returning alone', icon: RotateCcw },
};

/** One card per real `Booking` (one per container/trip) — no more single-tier Shipment-as-one-card synthesis now that Bookings are real (Phase 2). */
function bookingToPreviewItem(booking: BookingRecord, cycle: EmptyReturnCycleRecord | undefined): BookingPreviewItem {
  const now = Date.now();
  return {
    id: booking.id,
    bookingNumber: booking.reference.replace('BKG-', ''),
    /* The reference as stored, unmodified. `bookingNumber` above is the display
       form, and on the live book the two happen to be identical because
       references carry no `BKG-` prefix any more — which is exactly why this
       exists separately. Empty Return keys its records on the raw reference, so
       "Book return" must send that and not something that only coincides with
       it today. */
    bookingReference: booking.reference,
    containerNumber: booking.containerNumber ?? undefined,
    partnerId: booking.partnerId ?? undefined,
    partnerName: booking.partner?.companyLegalName,
    vehicleId: booking.vehicleId ?? undefined,
    driverId: booking.driverId ?? undefined,
    driverName: booking.driver?.fullName ?? 'Unassigned',
    driverPhone: booking.driver?.phone,
    // "Verified" reads as current documents, not expired — the closest honest
    // signal the real data has; there is no separate verified flag to fake.
    driverVerified: booking.driver ? isDriverVerified(booking.driver) : false,
    vehicleNumber: booking.vehicle?.plateNumber ?? '—',
    vehicleType: booking.vehicle?.truckType,
    vehicleVerified: booking.vehicle
      ? new Date(booking.vehicle.registrationExpiry).getTime() > now &&
        new Date(booking.vehicle.insuranceExpiry).getTime() > now
      : false,
    status: booking.status,
    statusIntent: statusIntentOf(booking.status),
    emptyReturnStage: emptyReturnStageOf(booking, cycle),
    emptyReturnMatched: Boolean(cycle?.nextBookingId),
    /* The empty return's own crew. Undefined — not the delivery pair — when
       nobody has been named: the card has to be able to say "the same driver
       went back for it" and "nobody has said yet" differently, and copying the
       delivery pair in here would erase that difference. */
    returnDriverId: booking.returnDriverId ?? undefined,
    returnVehicleId: booking.returnVehicleId ?? undefined,
    returnDriverName: booking.returnDriver?.fullName,
    returnVehicleNumber: booking.returnVehicle?.plateNumber,
    emptyReadyAt: booking.emptyReadyAt ?? undefined,
    emptyReturnCycleReference: cycle?.reference,
    co2EmissionsKg: booking.co2EmissionsKg,
    actualDistanceKm: booking.actualDistanceKm,
    co2FactorUsed: booking.co2FactorUsed,
    co2DistanceSource: booking.co2DistanceSource,
    driverRating: booking.driverRating,
    driverRatingReliability: booking.driverRatingReliability,
    driverRatingPunctuality: booking.driverRatingPunctuality,
    driverRatingProfessionalism: booking.driverRatingProfessionalism,
    driverNote: booking.driverNote,
    driverRatedByName: booking.driverRatedByName,
    driverRatedAt: booking.driverRatedAt,
  };
}

/**
 * One label → value line on a booking card, joined by a hairline that leads the
 * eye toward the value.
 *
 * The cards sit three to a row, so a label lands at the far left of a ~160px
 * line and its value at the far right with a hand's width of nothing in
 * between. At a glance the eye loses which value belongs to which label and has
 * to track back along the row — three times per card, six cards to a page.
 *
 * Two attempts were rejected before this one, and both taught it something. A
 * **dot leader** read as table-of-contents furniture: something to look at
 * rather than something that helps. A **tinted band** fixed the tracking but
 * put a shape around every row, which is far too much weight for three short
 * lines of text.
 *
 * So: a line again, but one that does a job. It is one pixel tall and starts
 * invisible at the label — which you have already read — then resolves as it
 * travels right, landing at full strength on the value you actually want. The
 * gradient is what makes it directional: a uniform rule is a divider and sits
 * there being a rule, while this one points. It adds no height, no shape and no
 * colour, and at rest it barely registers as a mark at all.
 */
function BookingField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        aria-hidden
        className="h-px min-w-4 flex-1 bg-gradient-to-r from-transparent via-border to-border-strong"
      />
      {children}
    </div>
  );
}

export function ShipmentOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  /* Matching reads its subject from the store, not the URL — so "Book return"
     selects the container first and then navigates, exactly as the Empty
     Container dossier's own "Open in Matching" does. */
  const selectEmptyForMatching = useEmptyReturnStore((state) => state.selectEmpty);
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: mission, isLoading, isError } = useShipment(id);
  const { data: shipmentRaw } = useShipmentRaw(mission?.id);
  const { data: bookingRecords } = useBookingsForShipment(mission?.id);
  // Every cycle system-wide — cheap at this data's scale, and the only way
  // to know whether one of THIS shipment's bookings is the "empty" side of
  // a match; there's no `?bookingIds=` filter on the endpoint to narrow it
  // server-side.
  const { data: cycles } = useCycles();
  const cyclesByBookingId = useMemo(() => {
    const map = new Map<string, EmptyReturnCycleRecord>();
    for (const cycle of cycles ?? []) map.set(cycle.bookingId, cycle);
    return map;
  }, [cycles]);
  const [selectedBooking, setSelectedBooking] = useState<BookingPreviewItem | null>(null);
  const [isBookingSheetOpen, setIsBookingSheetOpen] = useState(false);
  const [bookingPage, setBookingPage] = useState(1);

  // One card per real Booking (Phase 2) — a local overlay on top of the live
  // query so the sheet's cosmetic-only edits (POD upload, schedule fields,
  // neither of which has a backend field yet) can still update a card in
  // place without waiting on a refetch. A real status change instead comes
  // back through the query itself (see BookingPreviewSheet's own mutation).
  const [bookings, setBookings] = useState<BookingPreviewItem[]>([]);

  // The real Finance project this shipment was tagged to at creation (see CreateShipmentModal).
  const { data: linkedProject } = useProject(shipmentRaw?.projectId ?? undefined);

  /**
   * Who at Fleetin is on this job.
   *
   * Read straight off the query — no local draft. The mutation replaces the
   * whole set and returns the shipment, so the invalidated query is the single
   * source of truth for the stack and the picker alike; a local copy would
   * only be a second answer to drift from it.
   */
  const setCrew = useSetShipmentCrew();
  const crew = mission?.crew ?? [];
  const crewIds = crew.map((member) => member.id);
  const crewLeadId = crew.find((member) => member.isLead)?.id;

  /* Opened — so the list can stop calling it new. Keyed by the route's own id
     so a deep link marks the same row the directory does. */
  useEffect(() => {
    if (id) markShipmentSeen(id);
  }, [id]);

  useEffect(() => {
    if (bookingRecords) {
      setBookings(bookingRecords.map((b) => bookingToPreviewItem(b, cyclesByBookingId.get(b.id))));
    }
  }, [bookingRecords, cyclesByBookingId]);

  /* The open sheet holds its own copy of the row so it can keep rendering while
     the list refetches. That copy has to follow the list, or a debrief saved on
     the card behind it leaves the sheet showing the version from before the
     note — which reads as "the rating did not save" and sends the reader to the
     refresh button. Matched by id; an unmatched row keeps what it had. */
  useEffect(() => {
    setSelectedBooking((current) =>
      current ? (bookings.find((row) => row.id === current.id) ?? current) : current,
    );
  }, [bookings]);

  /**
   * "How did it go?" — asked off the data, not off the click.
   *
   * It used to hang on whichever control the operator happened to use: the
   * card's status picker asked, the sheet's asked, and the empty-return
   * matching popup — which is how most containers actually get marked home —
   * asked nobody, because it completes the booking from another module without
   * going near either control. A closed container's ratings were therefore a
   * lottery on the route taken to close it.
   *
   * Watching the rows instead catches every one of those paths, and catches
   * them exactly once: the move itself is the gate. The first pass only records
   * where each booking already is, so nothing is asked about a container that
   * was already home when the page opened, and `Completed` is the last rung —
   * a booking cannot arrive at it twice.
   */
  const [debrief, setDebrief] = useState<DebriefDraft | null>(null);
  const [debriefQueue, setDebriefQueue] = useState<DebriefSubject[]>([]);
  /* How many the closing owes in all, so the dialog can say which one this is
     — two drivers asked back to back look like one dialog that lost its data. */
  const [debriefTotal, setDebriefTotal] = useState(0);
  const [debriefBooking, setDebriefBooking] = useState<BookingPreviewItem | null>(null);
  const debriefSeen = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    if (bookings.length === 0) return;
    /* Hold the previous statuses while a dialog is up, so a second container
       closing behind this one is still asked about when this one is done. */
    if (debrief) return;

    const before = debriefSeen.current;
    debriefSeen.current = new Map(bookings.map((row) => [row.id, row.status]));
    if (!before) return;

    for (const row of bookings) {
      const was = before.get(row.id);
      if (!was || was === row.status) continue;
      const [first, ...rest] = debriefSubjectsFor(row.status, {
        /* Two people, two answers — see `debriefSubjectsFor`. */
        separateReturnDriver: Boolean(row.returnDriverId && row.returnDriverId !== row.driverId),
      });
      if (!first) continue;
      setDebriefBooking(row);
      setDebrief(emptyDebrief(first));
      setDebriefQueue(rest);
      setDebriefTotal(1 + rest.length);
      break;
    }
  }, [bookings, debrief]);

  // Deep link from Empty Return's cycle detail ("open this container's own
  // booking") — `?openBooking=<id>` opens the matching card's preview sheet
  // once the list has loaded, then clears itself so a refresh doesn't reopen it.
  const openBookingId = searchParams.get('openBooking');
  useEffect(() => {
    if (!openBookingId || bookings.length === 0) return;
    /* Matches the row's uuid OR its booking number.
     *
     * Both arrive: a Workspace task link carries the uuid, while a `/booking`
     * reference typed into a message carries only the human reference — a
     * message body is read by people, and burying a uuid in one to make a link
     * work would be the tail wagging the dog. */
    const target = bookings.find(
      (b) => b.id === openBookingId || b.bookingNumber === openBookingId,
    );
    if (target) {
      setSelectedBooking(target);
      setIsBookingSheetOpen(true);
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('openBooking');
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openBookingId, bookings]);

  const totalPages = Math.ceil(bookings.length / PAGE_SIZE);
  const pagedBookings = bookings.slice((bookingPage - 1) * PAGE_SIZE, bookingPage * PAGE_SIZE);
  const hasPagination = bookings.length > PAGE_SIZE;

  /**
   * How this shipment's boxes split — counted over every booking, not just the
   * page on screen, because "one of these four is still full" is a fact about
   * the shipment and not about pagination.
   */
  const containerSplit = useMemo(() => {
    const states = bookings.map((item) =>
      containerStateOf(item.status, Boolean(item.containerNumber)),
    );
    return {
      full: states.filter((state) => state === 'full').length,
      empty: states.filter((state) => state === 'empty').length,
      returned: states.filter((state) => state === 'returned').length,
      /* Every box on this shipment is back at the depot — nothing is owed and
         the job is closed. This is what greys the masthead: the user asked for
         the done colour to reach the shipment itself, not just the cards, so a
         finished consignment reads as finished the moment it opens. */
      done: allContainersReturned(states),
    };
  }, [bookings]);

  /**
   * Columns follow the count, so a page never ends in a lonely card: four
   * containers read as a 2×2 block rather than three and a straggler. Three is
   * the ceiling — wider cards than that lose the labels inside them.
   */
  const bookingColumnsClass =
    pagedBookings.length === 4
      ? '@[52rem]/page:grid-cols-2'
      : pagedBookings.length === 2
        ? '@[52rem]/page:grid-cols-2'
        /* Three across only once a third of the grid is a readable card. At
           ~180px it clipped the corner badge to "Booking No. 4…", and the
           reference is the one thing on that card that identifies it. */
        : '@[52rem]/page:grid-cols-2 @[62rem]/page:grid-cols-3';

  const handleBookingClick = (booking: BookingPreviewItem) => {
    setSelectedBooking(booking);
    setIsBookingSheetOpen(true);
  };

  const handleUpdateBooking = (updatedBooking: BookingPreviewItem) => {
    setBookings((prev) => prev.map((b) => (b.id === updatedBooking.id ? updatedBooking : b)));
    setSelectedBooking(updatedBooking);
  };

  /**
   * Every carrier on this job.
   *
   * Preferred from the shipment payload, which counts them server-side; the
   * bookings already loaded on this page are the fallback, since they carry the
   * same fact and a detail response that predates the field would otherwise
   * name one carrier on a two-carrier shipment.
   *
   * Above the early returns, like every other hook here — it used to sit beside
   * the header markup it feeds, which meant a loading render called fewer hooks
   * than the loaded one and React refused the whole page.
   */
  const shipmentTransporters = useMemo(() => {
    if (mission?.transporters?.length) return mission.transporters;
    const seen = new Map<string, { id: string; name: string }>();
    for (const booking of bookingRecords ?? []) {
      const id = booking.partnerId;
      const name = booking.partner?.companyLegalName;
      if (!id || !name || seen.has(id)) continue;
      seen.set(id, { id, name });
    }
    return [...seen.values()];
  }, [mission?.transporters, bookingRecords]);

  if (isLoading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Loading shipment…</div>;
  }

  if (isError || !mission) {
    return (
      <div className="py-16 text-center space-y-3">
        <p className="text-sm font-semibold text-foreground">Shipment {id ? `"${id}"` : ''} not found.</p>
        <Button variant="outline" size="sm" onClick={() => navigate(ROUTES.missions)} className="rounded-lg">
          Back to shipments
        </Button>
      </div>
    );
  }

  /**
   * The masthead speaks the same ladder phase as the booking cards below it and
   * the shipment cards in the directory — teal booked, green in transit,
   * **brand yellow while a box owes a return**, grey once every box is home.
   *
   * The slab itself carries it, not just the chip: a shipment is either not
   * started, running, owing a return or history, and that is the first thing
   * worth knowing on opening the page.
   *
   * The yellow arm was added on 2026-09-01. Empty Return had been drawn as a
   * yellow chip on a teal slab — the chip said one thing and the whole page
   * behind it said another, and teal is the app's *loaded* colour, so the
   * masthead of a shipment whose boxes were all stripped was painted the
   * colour of a full container. Yellow is `--container-empty`, the same fill
   * the EMPTY tag and the empty-return module use everywhere else.
   *
   * Ink is NOT white throughout any more, and cannot be: brand yellow takes
   * white at 1.8:1. Each arm names its own foreground, and the yellow one uses
   * the near-black `--container-empty-foreground` that the EMPTY tag already
   * pairs with the same fill.
   *
   * The done arm is checked first and reads the boxes rather than the rung,
   * because "finished" here means every container is back — a fact about the
   * bookings, which is what `containerSplit` counts.
   *
   * `statusPhaseOf`, not `statusIntentOf`: the ladder distinguishes the two
   * rungs inside green and inside amber, and this wants the phase.
   */
  const slabPhase = statusPhaseOf(mission.status);
  const slab = containerSplit.done
    ? {
        key: 'done' as const,
        bg: 'bg-tile-done',
        fg: 'text-tile-done-foreground',
        fgMuted: 'text-tile-done-foreground/80',
        fgSoft: 'text-tile-done-foreground/85',
        rule: 'bg-tile-done-foreground/30',
        ink: 'text-tile-done',
        /* The crew stack derives every one of its colours from the tile, and
           cannot see which one it is sitting on — so the tile says. */
        crewTone: 'tile-done' as const,
      }
    : /* Unstuffing, and only Unstuffing — the rung that carries the ladder's
         one red. A booking on it wears a red badge and a red corner tab, and a
         shipment whose boxes are all there has to agree: one status, one
         colour, or the card and the page it opens disagree about the same
         word. */
      slabPhase === 'red'
      ? {
          key: 'red' as const,
          bg: 'bg-destructive',
          fg: 'text-destructive-foreground',
          fgMuted: 'text-destructive-foreground/80',
          fgSoft: 'text-destructive-foreground/85',
          rule: 'bg-destructive-foreground/30',
          ink: 'text-destructive',
          crewTone: 'tile-destructive' as const,
        }
      : /* Owing a return — the boxes are stripped and the empties have to get
           back to the depot. The one arm that does not take white ink. */
        slabPhase === 'orange'
        ? {
            key: 'empty' as const,
            bg: 'bg-container-empty',
            fg: 'text-container-empty-foreground',
            fgMuted: 'text-container-empty-foreground/75',
            fgSoft: 'text-container-empty-foreground/80',
            rule: 'bg-container-empty-foreground/30',
            /* `ink` is this slab's colour used as TEXT on a white plate — the
               Empty Returns button, the Raise chip. `--container-empty` is
               orange-500 and lands at 2.2:1 there, so the white plates take the
               ramp's dark step instead. Every other arm can use its own fill
               because every other fill is dark enough to read on white. */
            ink: 'text-container-empty-subtle-foreground',
            crewTone: 'tile-empty' as const,
          }
        : /* In transit — every box still loaded and the job under way. The slab
             goes green, the same green the booking cards below it and the
             shipment cards in the directory already wear for these rungs. It
             used to stay teal, so a shipment that had not left yet and one
             halfway through opened on the identical masthead. */
          slabPhase === 'green'
          ? {
              key: 'green' as const,
              bg: 'bg-success',
              fg: 'text-success-foreground',
              fgMuted: 'text-success-foreground/80',
              fgSoft: 'text-success-foreground/85',
              rule: 'bg-success-foreground/30',
              ink: 'text-success',
              crewTone: 'tile-success' as const,
            }
          : {
              key: 'teal' as const,
              bg: 'bg-tile-teal',
              fg: 'text-tile-teal-foreground',
              fgMuted: 'text-tile-teal-foreground/80',
              fgSoft: 'text-tile-teal-foreground/85',
              rule: 'bg-tile-teal-foreground/30',
              ink: 'text-tile-teal',
              crewTone: 'tile-teal' as const,
            };

  /**
   * The status chip, coloured on the slab rather than on a card.
   *
   * `--container-full` is teal on a teal tile, so the live-and-loaded chip
   * inverts to the tile's own white-plate idiom instead. Empty and returned keep
   * the exact fills the booking cards use, since both already contrast.
   */
  /* Off the ladder (cancelled, failed) there is no progress to draw — a
     part-filled rail on a stopped job would say it is still running. */
  const headerProgress = shipmentProgress(mission.status, carriesContainer(mission));


  const shipmentState: ContainerState | null = containerSplit.done
    ? 'returned'
    : containerSplit.empty > 0
      ? 'empty'
      : containerSplit.full > 0
        ? 'full'
        : null;
  const headerChipClass =
    shipmentState === 'empty'
      ? /* Yellow on yellow is not a chip. On the empty slab it inverts to the
           dark plate, exactly as the returned chip does on the ink slab; on any
           other slab the fill contrasts and stays as it is. */
        slab.key === 'empty'
        ? 'bg-container-empty-foreground text-container-empty'
        : 'bg-container-empty text-container-empty-foreground'
      : shipmentState === 'returned'
        ? /* On the ink slab the chip inverts, the way the live states do on
             teal — a black chip on a black masthead would disappear. */
          'bg-tile-done-foreground text-tile-done'
        : shipmentState === 'full'
          ? `bg-white ${slab.ink}`
          : 'bg-secondary text-secondary-foreground';

  return (
    /* `report-host`: printing the Shipment Report prints the report, not the page
       around it — the print stylesheet hides every child of this element that
       does not contain the report sheet. */
    <div className="@container/page report-host space-y-4 px-0 pb-12 sm:space-y-6">

      {/*
       * ── MASTHEAD ──
       *
       * A filled brand tile, the same fill the KPI strips use — a record page
       * opening on a white heading read as an unfinished screen. The record
       * leads inside it: the reference is the H1 and "Shipment Overview" steps
       * back to an eyebrow, because the app's own breadcrumb already says where
       * you are. Status and route ride along, since they are what every block
       * below is about, and the status is a labelled chip, never colour alone.
       */}
      <header className={`rounded-card ${slab.bg} ${slab.fg} shadow-sm transition-colors`}>
        {/* Side by side once THIS BAND is wide enough — a container query, not
            a viewport one, because the deciding width is the content column and
            that changes when the sidebar collapses. On a viewport breakpoint
            the masthead stayed stacked at 1150px of content and left half the
            band empty.
            62rem is measured, not chosen: the crew stack and the three actions
            are ~550px and `shrink-0`, and the identity block needs ~400px for
            its route line. Below that the two stack and each gets the full
            width — which at `sm` left the route 79px and at `lg` 234px, for a
            route that is 322. */}
        <div className="flex flex-col gap-4 p-4 sm:p-5 @[62rem]/page:flex-row @[62rem]/page:items-center @[62rem]/page:justify-between @[62rem]/page:gap-6">
          {/* `flex-1`, because the actions opposite are `shrink-0`: without it
              this block sizes to its own wrapped content and settles at ~230px
              on a 930px masthead, which is how the route line ended up 99px
              wide with a 322px route in it. */}
          <div className="flex min-w-0 flex-1 items-center gap-3.5">
            <IconChip
              icon={containerSplit.done ? PackageCheck : Package}
              tint="on-teal"
              size={44}
              className="hidden sm:flex"
            />
            <div className="min-w-0">
              <p className={`text-[11px] font-semibold uppercase tracking-[0.11em] ${slab.fgMuted}`}>
                Shipment Overview
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <h1 className={`font-mono text-2xl font-extrabold leading-none tracking-tight ${slab.fg} sm:text-[28px]`}>
                  {id ?? mission.id}
                </h1>
                <Badge
                  variant="solid"
                  size="md"
                  className={`uppercase tracking-[0.08em] ${headerChipClass}`}
                >
                  {displayShipmentStatus(mission.status, 'shipment')}
                </Badge>
                {/* One status, and how far along it is — the same pairing the
                    shipments list uses, so a shipment reads the same on the row
                    you clicked and the page it opened. */}
                {headerProgress && (
                  <span
                    className={`text-base font-extrabold tabular-nums ${slab.fg}`}
                    title={`Step ${headerProgress.step} of ${headerProgress.of}`}
                  >
                    {headerProgress.percent}% done
                  </span>
                )}
              </div>

              <div className={`mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] ${slab.fgSoft}`}>
                {/* `flex-1` so the route SHRINKS rather than shoving what
                    follows onto its own line. A wrapping flex row wraps before
                    it shrinks, so without this a long route pushed the
                    transporter marks down a line — and the hairline rule went
                    with them, leaving a stray `|` floating at the start of a
                    line with a logo after it. */}
                <span
                  className="inline-flex min-w-0 flex-1 items-center gap-1.5"
                  /* On a phone this line has to truncate — it is a 320px screen
                     and a 322px route. The whole thing stays reachable. */
                  title={`${mission.pickupLocation.name} → ${mission.deliveryLocation.name}`}
                >
                  <Route className="w-3.5 h-3.5 shrink-0" aria-hidden />
                  <span className="truncate">
                    {mission.pickupLocation.name} → {mission.deliveryLocation.name}
                  </span>
                </span>
                {/* Who is carrying it — all of them.
                    The carrier is assigned per booking, so a split job has two
                    or three, and the shipment's own `transporter` field is only
                    a snapshot of whichever one was named at creation. The marks
                    are white-ringed for the slab they sit on, and the names are
                    on hover. */}
                {shipmentTransporters.length > 0 && (
                  <>
                    <span aria-hidden className={`hidden h-3 w-px sm:inline-block ${slab.rule}`} />
                    <Tooltip
                      content={
                        shipmentTransporters.length === 1
                          ? `Transporter · ${shipmentTransporters[0]?.name}`
                          : `${shipmentTransporters.length} transporters · ${shipmentTransporters
                              .map((t) => t.name)
                              .join(', ')}`
                      }
                    >
                      <span className="inline-flex shrink-0 cursor-default items-center">
                        {shipmentTransporters.map((transporter, index) => (
                          <CompanyMark
                            key={transporter.id}
                            id={transporter.id}
                            name={transporter.name}
                            size="sm"
                            className={
                              index > 0
                                ? `ring-white/70 ${MARK_STACK_OVERLAP.sm}`
                                : 'ring-white/70'
                            }
                          />
                        ))}
                        <span className="sr-only">
                          {shipmentTransporters.length === 1 ? 'Transporter: ' : 'Transporters: '}
                          {shipmentTransporters.map((t) => t.name).join(', ')}
                        </span>
                      </span>
                    </Tooltip>
                  </>
                )}
                {linkedProject && (
                  <>
                    <span aria-hidden className={`hidden h-3 w-px sm:inline-block ${slab.rule}`} />
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <FolderOpen className="w-3.5 h-3.5 shrink-0" aria-hidden />
                      <span className="truncate font-semibold">{linkedProject.name}</span>
                      <span className="font-mono text-[11px] opacity-80">
                        {linkedProject.reference}
                      </span>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/*
             * Who at Fleetin is on it.
             *
             * On the masthead rather than in a panel below, because "whose job
             * is this" belongs with the reference and the status — it is one of
             * the three things you open a shipment to find out, and the answer
             * used to live only in somebody's head. Clicking the stack opens
             * the team; the dashed placeholder is the empty state, and it is a
             * hole worth filling rather than a control that hides when unused.
             */}
            <CrewPicker
              value={crewIds}
              leadUserId={crewLeadId}
              busy={setCrew.isPending}
              onChange={(userIds, leadUserId) =>
                setCrew.mutate({ id: mission.id, userIds, leadUserId })
              }
            >
              <CrewStack crew={crew} tone={slab.crewTone} size="md" interactive className="mr-1" />
            </CrewPicker>

            {/*
             * On a filled tile the action inverts: white plate, teal ink — the
             * same pair `IconChip`'s `on-teal` uses. Literal white, not
             * `bg-card`, because the tile holds its colour in both themes and a
             * dark-mode card on it would read as a hole.
             */}
            {/*
             * Raise — and a count of what is still open on this shipment.
             *
             * Deliberately not a thread. A comment thread lived on this page
             * for one day in August 2026 and was withdrawn, because nobody
             * re-opens a shipment to check for replies. What stays is the
             * moment that matters — you are looking at the shipment when you
             * notice — and a number that links to where it is read.
             */}
            <RecordRaise
              recordType="SHIPMENT"
              recordId={mission.id}
              recordRef={mission.id}
              label={mission.customer?.company}
              tone="slab"
              slabInk={slab.ink}
            />
            {/* No "Empty Returns" button. It sent the reader to the module's
                whole board rather than to anything about THIS shipment, and
                every container that owes a return already carries its own way
                in — the stage mark on the booking card, and the Empty Return
                card in its preview sheet, both of which open the container
                rather than the backlog. Removed 2026-09-01. */}
          </div>
        </div>
      </header>

      {/* ── BOOKINGS CARD ── */}
      <Card className="p-4 sm:p-5 rounded-lg border border-border/80 bg-card space-y-3">
        {/* Header — the count, then the split that matters: how many of these
            boxes are still carrying cargo and how many are waiting to go back.
            Same two colours as the cards under it. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-foreground text-sm sm:text-base">Bookings</h3>
          <div className="flex items-center gap-1.5">
            {containerSplit.full > 0 && (
              <Badge variant="subtle" intent="primary" size="sm" className="font-bold">
                {containerSplit.full} Full
              </Badge>
            )}
            {containerSplit.empty > 0 && (
              <Badge variant="subtle" intent="accent" size="sm" className="font-bold">
                {containerSplit.empty} Empty
              </Badge>
            )}
            {containerSplit.returned > 0 && (
              <Badge
                variant="subtle"
                intent="default"
                size="sm"
                className="font-bold text-container-returned-subtle-foreground"
              >
                {containerSplit.returned} Returned
              </Badge>
            )}
            <Badge variant="solid" intent="primary" size="sm">
              {bookings.length}
            </Badge>
          </div>
        </div>

        {/* No shipment-level carbon total here.
         *
         * It sat at the top of this card for one revision and was moved: a
         * consignment's total is an analysis figure, and the analysis has a
         * home — the Shipment Report below, where every other rolled-up number
         * on this page already lives. What stays on this card is what each
         * card is about: the container's own figure, on the container's own
         * card. */}

        {/* Booking Items */}
        <div className={`grid grid-cols-1 gap-2.5 @[34rem]/page:grid-cols-2 ${bookingColumnsClass}`}>
          {pagedBookings.map(item => {
            /* Teal while the box is full, brand yellow once it is empty — the
               app-wide container rule (`@/lib/containerState`). It is the whole
               point of this grid: four cards, and which of them are still
               carrying cargo is a colour, not a sentence you have to read. The
               corner tab carries it because it is the loudest mark on the card,
               and the status chip follows so the two never disagree. */
            const containerState = containerStateOf(item.status, Boolean(item.containerNumber));

            /* No box on this booking (a bulk or machinery load) — it has no
               full/empty state at all, so it keeps the ladder's own colours. */
            /* The ladder's phase, not the container's state. The card already
               wears a FULL/EMPTY tag saying what is inside the box; this badge
               answers the other question — how far along the job is — and it
               used to be overruled by the container state, so every booking in
               transit printed the teal of a loaded box instead of the green of
               work in progress. */
            const getBadgeIntent = () => statusBadgeIntentOf(item.status);

            /* Who is on the box RIGHT NOW.
               A different truck often comes back for the empty, and the card
               kept naming the delivery crew all the way to Completed — so a
               container marked "Heading back" was credited to a driver who had
               finished with it days earlier, and the sheet beside it disagreed.
               The rows swap over once the empty leg starts, and say so: the
               label is what tells the two crews apart. */
            const onReturnLeg = ['Empty Ready', 'Empty Picked Up', 'Completed'].includes(
              item.status,
            );
            /* Each row asks its own question, because a transporter can send
               the same driver back in a different truck. And "the same person
               went back for it" is not news: naming that driver "Return driver"
               would put a second title on one fact. */
            const returnedByOther =
              onReturnLeg && Boolean(item.returnDriverId) && item.returnDriverId !== item.driverId;
            const returnedInOther =
              onReturnLeg &&
              Boolean(item.returnVehicleId) &&
              item.returnVehicleId !== item.vehicleId;
            const crewName = returnedByOther ? item.returnDriverName : item.driverName;
            const crewPlate = returnedInOther ? item.returnVehicleNumber : item.vehicleNumber;

            return (
              <div
                key={item.id}
                onClick={() => handleBookingClick(item)}
                className="group relative overflow-hidden rounded-lg border border-border/80 bg-card p-3 shadow-2xs transition cursor-pointer hover:border-primary/50"
              >
                {/*
                  * The card's header, and it is a ROW.
                  *
                  * The reference tab and the status control used to be two
                  * absolutely-positioned children — `top-0 left-0` and
                  * `top-2 right-2` — with `pt-9` reserving a band for them.
                  * Neither knew the other existed, so on a narrow card (the
                  * grid goes two-up on a phone, and the drawer is 448px) the
                  * tab grew under the status pill and the booking number was
                  * read through it. In flow they share a line and cannot
                  * collide at any width; the negative margins keep the tab
                  * bled into the card's corner, which is the whole point of a
                  * corner badge.
                  */}
                {/* Wraps, so the status pill drops to its own line rather
                    than squeezing the reference tab into "Booking No. 46…" on
                    a narrow card. */}
                <div className="-ml-3 -mt-3 mb-2.5 flex flex-wrap items-start gap-2">
                  <CornerBadge
                    label={`Booking No. ${item.bookingNumber}`}
                    /* The phase, like the status badge opposite it — see
                       `statusCornerIntentOf`. Reading the container state here
                       left the tab teal through all three transit rungs while
                       the badge went green. */
                    intent={statusCornerIntentOf(item.status)}
                    position="top"
                    className="min-w-0 [&>span]:truncate"
                  />

                  {/* How the empty went home — a filled disc in the gap beside
                   * the reference tab.
                   *
                   * It reads on the container line too, next to the tag it
                   * qualifies, and that is where it was built first; the user
                   * put it here instead and confirmed it after trying both.
                   * The strip is empty on every card and the container line is
                   * ~160px at three-up, so this is the placement that costs
                   * nothing.
                   *
                   * Filled, not stroked: a 2px line glyph has no weight beside
                   * a solid black tab, so the colour is the disc and the arrow
                   * is cut out of it. `mt-2` lines it up with the status pill
                   * opposite — the tab is pulled out of the card's padding with
                   * `-mt-3`, so nothing in this row sits on its own baseline. */}
                  {/* Shown the moment the return is DECIDED — paired, or going
                      back alone — not when the box finally arrives.
                      
                      It used to be gated on `containerState === 'returned'`,
                      so the one mark that says how a container is getting home
                      appeared only after it already had. That is the half of
                      the job nobody needed: while the box is still out is
                      exactly when somebody is deciding what to do with it, and
                      the card gave no sign a decision had been made until the
                      decision no longer mattered. */}
                  {(item.emptyReturnStage === 'matched' ||
                    item.emptyReturnStage === 'standalone' ||
                    item.emptyReturnStage === 'returned') && (
                    <Tooltip
                      content={
                        /* Tense follows the box. Before it is home these are
                           plans, and writing them in the past tense on a
                           container still sitting in a yard reads as a claim
                           that it is already back. */
                        item.emptyReturnStage === 'returned'
                          ? item.emptyReturnMatched
                            ? 'Matched — this empty went back under another full load, so no empty leg was driven for it.'
                            : 'Standalone — this empty was driven back to the depot on its own.'
                          : item.emptyReturnMatched
                            ? 'Matched — this empty is going back under another full load, so no empty leg is driven for it.'
                            : 'Standalone — this empty is going back to the depot on its own.'
                      }
                    >
                      <span
                        className={cn(
                          'mt-2 inline-flex size-[18px] shrink-0 cursor-default items-center justify-center rounded-full',
                          item.emptyReturnMatched
                            /* White on the magenta, dark ink on the amber: the
                               two fills sit at different lightnesses, so the
                               glyph flips rather than either colour being
                               nudged to suit one rule. */
                            ? 'bg-return-matched text-white'
                            : 'bg-return-standalone text-return-standalone-ink',
                        )}
                      >
                        {item.emptyReturnMatched ? (
                          <ArrowLeftRight className="size-2.5 stroke-[3]" aria-hidden />
                        ) : (
                          <ArrowLeftToLine className="size-2.5 stroke-[3]" aria-hidden />
                        )}
                        {/* The word itself, for a screen reader and for anyone
                            who never hovers — the tooltip is the explanation,
                            not the label. */}
                        <span className="sr-only">
                          {item.emptyReturnMatched ? 'Matched' : 'Standalone'}
                        </span>
                      </span>
                    </Tooltip>
                  )}



                  {/* Status badge, and the control. Changing a rung is the most
                      frequent action in the app and it used to cost three clicks
                      and a side panel over the rest of the shipment; the badge
                      already says the status, so it is what you click. */}
                  <div className="ml-auto mt-2 flex shrink-0 items-center gap-1.5">
                  <BookingStatusPicker
                    /* The shipper's name rides along so the closing debrief can
                       say who it is asking about. */
                    booking={{ ...item, shipperCompany: shipmentRaw?.customerCompany }}
                    onChanged={(status) =>
                      setBookings((prev) =>
                        prev.map((row) =>
                          row.id === item.id
                            ? { ...row, status, statusIntent: statusIntentOf(status) }
                            : row,
                        ),
                      )
                    }
                  >
                    {/* Solid, not subtle. The phase colour on a pale wash was
                        the same hue as the verified tick beside it and still
                        looked like a different mark — a tinted pill and a solid
                        disc do not read as one colour however exactly their
                        hexes agree. Filled, the badge *is* the green. */}
                    <Badge
                      variant="solid"
                      intent={getBadgeIntent()}
                      size="sm"
                      className="cursor-pointer gap-1 pr-1.5"
                    >
                      {displayShipmentStatus(item.status)}
                      <ChevronDown className="size-3 opacity-60" aria-hidden />
                    </Badge>
                  </BookingStatusPicker>
                  </div>
                </div>

                {/* Fields */}
                <div className="space-y-1.5 text-xs">
                  {containerState && (
                    <BookingField label="Container">
                      {/* Wraps rather than truncates: at three columns the row
                          is ~160px, and a squeezed `truncate` ate the container
                          number entirely and left the tag reading "EMPTY" with
                          nothing to be empty. */}
                      <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-1.5 gap-y-1">
                        <span
                          className="truncate font-mono font-semibold text-foreground"
                          title={item.containerNumber}
                        >
                          {item.containerNumber}
                        </span>
                        <ContainerStateTag state={containerState} status={item.status} small className="shrink-0" />
                        {/* The return's progress rides here rather than on a
                            labelled row of its own. The card was saying "empty"
                            three times — the status badge, this tag, and an
                            "Empty Return" row underneath — and a reader had to
                            work out which of the three was the news. The tag
                            supplies the noun, so this only has to add the verb.

                            Dropped once the box is home: the tag beside it
                            reads RETURNED and the glyph above says how it got
                            there, so the word would be the third telling. */}
                        {item.emptyReturnStage &&
                          item.emptyReturnStage !== 'awaiting_empty' &&
                          item.emptyReturnStage !== 'returned' &&
                          containerState !== 'returned' &&
                          (() => {
                            const stage = item.emptyReturnStage;
                            const mark = EMPTY_RETURN_STAGE_MARK[stage];
                            const Glyph = mark.icon;

                            /* The one stage that is a question rather than a
                               fact. Everything else here reports what was
                               decided; this one is the container standing in a
                               yard with nothing arranged, and the card is where
                               somebody notices. So it is a button, and it opens
                               Matching on this exact container with its
                               candidate loads already worked out — the same
                               destination the Empty Container dossier's own
                               "Open in Matching" uses, so one decision keeps
                               one door. */
                            if (stage === 'waiting_match') {
                              const reference = item.bookingReference ?? item.bookingNumber;
                              return (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    /* The whole card opens the booking preview.
                                       Without this, "Book return" would open
                                       the sheet and navigate underneath it. */
                                    event.stopPropagation();
                                    selectEmptyForMatching(reference);
                                    navigate(ROUTES.emptyReturnsMatching);
                                  }}
                                  title="Empty return — book this container a ride back"
                                  className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-warning-subtle-foreground/30 bg-warning-subtle px-1.5 py-0.5 text-[11px] font-semibold text-warning-subtle-foreground transition-colors hover:border-warning-subtle-foreground/60 hover:bg-warning-subtle/70 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                                >
                                  {Glyph ? <Glyph className="size-3 shrink-0" aria-hidden /> : null}
                                  {mark.label}
                                </button>
                              );
                            }

                            return (
                              <span
                                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-warning-subtle-foreground"
                                title={`Empty return — ${mark.label}`}
                              >
                                {/* The glyph stands in for the separator rather
                                    than sitting next to it — a dot AND an arrow
                                    is two marks doing one job. */}
                                {Glyph ? <Glyph className="size-3 shrink-0" aria-hidden /> : <span aria-hidden>·</span>}
                                {mark.label}
                              </span>
                            );
                          })()}
                      </div>
                    </BookingField>
                  )}

                  <BookingField label={returnedByOther ? 'Return driver' : 'Driver'}>
                    <div className="flex min-w-0 items-center gap-1">
                      <span className="truncate font-semibold text-foreground transition-colors group-hover:text-primary">
                        {crewName}
                      </span>
                      {!returnedByOther && item.driverVerified && (
                        <VerificationBadge state="verified" size="sm" />
                      )}
                    </div>
                  </BookingField>

                  <BookingField label={returnedInOther ? 'Return vehicle' : 'Vehicle No.'}>
                    {/* `min-w-0` + `truncate`: a plate is one token, so a
                        narrow card broke "DT-2238-DJ" across two lines at the
                        hyphen and pushed the verified tick onto a third. */}
                    <div className="flex min-w-0 items-center gap-1">
                      <span className="truncate font-semibold text-foreground" title={crewPlate}>
                        {crewPlate}
                      </span>
                      {!returnedInOther && item.vehicleVerified && (
                        <VerificationBadge state="verified" size="sm" />
                      )}
                    </div>
                  </BookingField>

                  {/* What this box's run cost the air. Below the crew rows
                      rather than among them: it is a consequence of the trip,
                      not a party to it, and it draws nothing at all until
                      there is a truck to attribute it to. */}
                  <Co2CardStrip co2Kg={item.co2EmissionsKg} distanceKm={item.actualDistanceKm} />

                </div>


              </div>
            );
          })}
        </div>

        {/* Pagination — only shown when there are more items than PAGE_SIZE */}
        {hasPagination && (
          <div className="pt-1 border-t border-border/50 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              Page <span className="font-semibold text-foreground">{bookingPage}</span> of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={bookingPage === 1}
                onClick={() => setBookingPage(p => p - 1)}
                className="w-7 h-7 rounded-md flex items-center justify-center border border-border/70 bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(pg => (
                <button
                  key={pg}
                  type="button"
                  onClick={() => setBookingPage(pg)}
                  className={`w-7 h-7 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer
                    ${pg === bookingPage
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border/70 bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary'
                    }`}
                  aria-label={`Page ${pg}`}
                >
                  {pg}
                </button>
              ))}
              <button
                type="button"
                disabled={bookingPage === totalPages}
                onClick={() => setBookingPage(p => p + 1)}
                className="w-7 h-7 rounded-md flex items-center justify-center border border-border/70 bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                aria-label="Next page"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* ── SHIPMENT REPORT ── */}
      {/* The whole reporting system for this consignment: every container's
          mission on one line, then the selected mission's own report —
          overview, timeline, transport KPIs, container return, responsibility,
          exceptions. Computed from recorded timestamps only, and downloadable
          as PDF. The panel owns its heading, so there is none here. */}
      <ShipmentReportPanel
        bookings={bookingRecords ?? []}
        cyclesByBookingId={cyclesByBookingId}
      />

      {/* What has been reported about this shipment.
          Below the report, because the report is what the shipment did and
          this is what somebody outside says went wrong with it — the second
          question is only asked once the first has been read. */}
      <RecordTickets
        recordType="SHIPMENT"
        recordId={mission.id}
        recordRef={id ?? mission.id}
        label={mission.customer.company}
        className="space-y-3 rounded-lg border border-border/80 bg-card p-4"
      />

      {/* BOOKING PREVIEW SIDE SHEET */}
      <BookingPreviewSheet
        shipmentRef={id ?? mission.id}
        open={isBookingSheetOpen}
        booking={selectedBooking}
        onClose={() => setIsBookingSheetOpen(false)}
        onUpdateBooking={handleUpdateBooking}
      />

      {/* ── HOW DID IT GO? ──
          One dialog for the whole page: the card pickers and the sheet no
          longer carry their own, so a booking that closes is asked about once
          however it got closed. */}
      <BookingDebriefDialog
        draft={debrief}
        bookingId={debriefBooking?.id ?? ''}
        driverName={debriefBooking?.driverName}
        returnDriverName={debriefBooking?.returnDriverName}
        step={debriefTotal - debriefQueue.length}
        total={debriefTotal}
        onChange={setDebrief}
        /* Saved or skipped, the next subject opens — a skipped question is
           still answered, with "nothing to say". */
        onClose={() => {
          const [next, ...rest] = debriefQueue;
          setDebriefQueue(rest);
          setDebrief(next ? emptyDebrief(next) : null);
          if (!next) {
            setDebriefBooking(null);
            setDebriefTotal(0);
          }
        }}
      />
    </div>
  );
}
