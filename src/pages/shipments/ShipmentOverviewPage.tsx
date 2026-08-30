import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import {
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
  Tooltip,
  VerificationBadge,
} from '@/design-system';
import { ROUTES } from '@/config/routes';
import { BookingPreviewSheet, type BookingPreviewItem, type EmptyReturnStage } from './components';
import { CrewPicker, CrewStack } from '@/components/crew';
import { RecordRaise } from '@/features/workspace';
import { useSetShipmentCrew, useShipment, useShipmentRaw } from '@/features/shipments/api/queries';
import { useBookingsForShipment } from '@/features/bookings/api/queries';
import { ShipmentReportPanel } from '@/components/reports';
import { type BookingRecord } from '@/features/bookings/api/bookingsService';
import {
  displayShipmentStatus,
  shipmentProgress,
  statusBadgeIntentOf,
  statusCornerIntentOf,
  statusIntentOf,
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

/** Mirrors the backend's `DELIVERED_STATUSES` (`empty-return-status.util.ts`) — the same boundary Empty Return itself uses to decide when a booking's container is even eligible to go back. */
const DELIVERED_STATUSES = ['Arrived', 'Unloading', 'POD Submitted', 'Empty Ready', 'Completed'];

/**
 * Where this booking's own container sits on its way back — purely a
 * read of Empty Return's already-real data (a matched cycle, or the
 * standalone flag), never a new status of its own. `undefined` before the
 * booking is delivered, since the question doesn't apply yet.
 */
function emptyReturnStageOf(booking: BookingRecord, cycle: EmptyReturnCycleRecord | undefined): EmptyReturnStage | undefined {
  // No box, no empty return. A bulk or machinery load has nothing to give
  // back, so the row simply does not apply — it used to read "Awaiting match"
  // on tipper loads, inventing an obligation that will never exist.
  if (!booking.containerNumber) return undefined;
  if (!DELIVERED_STATUSES.includes(booking.status)) return undefined;
  /* The return starts when Operations says the box was emptied — the "Empty
   * Ready" rung — not when the truck pulled up. Until then the container is
   * still being stripped and there is nothing to match it against. */
  if (!booking.emptyReadyAt) return 'awaiting_empty';
  // `returnedAt` is the fact that the box is home; the cycle's own status can
  // read "completed" for the leg that carried it while the box itself is not
  // yet logged back.
  if (cycle) return cycle.returnedAt ? 'returned' : 'matched';
  if (booking.emptyReturnException) return 'standalone';
  return 'waiting_match';
}

/** Compact label for the booking card's own row — the full sentence lives in the preview sheet's Empty Return card. */
const EMPTY_RETURN_STAGE_LABEL: Record<EmptyReturnStage, string> = {
  awaiting_empty: 'Not emptied yet',
  waiting_match: 'Awaiting match',
  matched: 'In progress',
  returned: 'Returned',
  standalone: 'Standalone',
};

/** One card per real `Booking` (one per container/trip) — no more single-tier Shipment-as-one-card synthesis now that Bookings are real (Phase 2). */
function bookingToPreviewItem(booking: BookingRecord, cycle: EmptyReturnCycleRecord | undefined): BookingPreviewItem {
  const now = Date.now();
  return {
    id: booking.id,
    bookingNumber: booking.reference.replace('BKG-', ''),
    containerNumber: booking.containerNumber ?? undefined,
    partnerId: booking.partnerId ?? undefined,
    partnerName: booking.partner?.companyLegalName,
    vehicleId: booking.vehicleId ?? undefined,
    driverId: booking.driverId ?? undefined,
    driverName: booking.driver?.fullName ?? 'Unassigned',
    driverPhone: booking.driver?.phone,
    // "Verified" reads as current documents, not expired — the closest honest
    // signal the real data has; there is no separate verified flag to fake.
    driverVerified: booking.driver ? new Date(booking.driver.licenseExpiry).getTime() > now : false,
    vehicleNumber: booking.vehicle?.plateNumber ?? '—',
    vehicleType: booking.vehicle?.truckType,
    vehicleVerified: booking.vehicle
      ? new Date(booking.vehicle.registrationExpiry).getTime() > now &&
        new Date(booking.vehicle.insuranceExpiry).getTime() > now
      : false,
    status: booking.status,
    statusIntent: statusIntentOf(booking.status),
    emptyReturnStage: emptyReturnStageOf(booking, cycle),
    emptyReadyAt: booking.emptyReadyAt ?? undefined,
    emptyReturnCycleReference: cycle?.reference,
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

  // Deep link from Empty Return's cycle detail ("open this container's own
  // booking") — `?openBooking=<id>` opens the matching card's preview sheet
  // once the list has loaded, then clears itself so a refresh doesn't reopen it.
  const openBookingId = searchParams.get('openBooking');
  useEffect(() => {
    if (!openBookingId || bookings.length === 0) return;
    const target = bookings.find((b) => b.id === openBookingId);
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
      ? 'lg:grid-cols-2'
      : pagedBookings.length === 2
        ? 'lg:grid-cols-2'
        : 'lg:grid-cols-3';

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
   * the shipment cards in the directory — teal booked, **green in transit**,
   * grey once every box is home.
   *
   * The slab itself carries it, not just the chip: a shipment is either not
   * started, running or history, and that is the first thing worth knowing on
   * opening the page. White ink throughout, so nothing inside the header
   * changes with it.
   *
   * The done arm is checked first and reads the boxes rather than the rung,
   * because "finished" here means every container is back — a fact about the
   * bookings, which is what `containerSplit` counts.
   */
  const slab = containerSplit.done
    ? {
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
    : /* In transit — every box still loaded and the job under way. The slab
         goes green, the same green the booking cards below it and the shipment
         cards in the directory already wear for these rungs. It used to stay
         teal, so a shipment that had not left yet and one halfway through
         opened on the identical masthead. */
      statusIntentOf(mission.status) === 'green'
      ? {
          bg: 'bg-success',
          fg: 'text-success-foreground',
          fgMuted: 'text-success-foreground/80',
          fgSoft: 'text-success-foreground/85',
          rule: 'bg-success-foreground/30',
          ink: 'text-success',
          crewTone: 'tile-success' as const,
        }
      : {
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
      ? 'bg-container-empty text-container-empty-foreground'
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
    <div className="report-host space-y-4 sm:space-y-6 pb-12 px-0">

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
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-5">
          <div className="flex min-w-0 items-center gap-3.5">
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
                <span className="inline-flex min-w-0 items-center gap-1.5">
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
                    <span aria-hidden className={`h-3 w-px ${slab.rule}`} />
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
                            className={index > 0 ? '-ml-2 ring-white/70' : 'ring-white/70'}
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
                    <span aria-hidden className={`h-3 w-px ${slab.rule}`} />
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

            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate(ROUTES.emptyReturns)}
              leadingIcon={<RotateCcw />}
              className={`cursor-pointer bg-white ${slab.ink} shadow-xs hover:bg-white/90 active:bg-white/80`}
            >
              Empty Returns
            </Button>
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

        {/* Booking Items */}
        <div className={`grid grid-cols-1 gap-2.5 sm:grid-cols-2 ${bookingColumnsClass}`}>
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
                <div className="-ml-3 -mt-3 mb-2.5 flex items-start gap-2">
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
                            supplies the noun, so this only has to add the verb. */}
                        {/* `returned` is dropped as well as `awaiting_empty`: the
                            tag beside it already reads RETURNED, and the card was
                            printing the same word twice on the same line. What
                            survives here is only what the tag cannot say — which
                            *stage of the return* an empty box is in. */}
                        {item.emptyReturnStage &&
                          item.emptyReturnStage !== 'awaiting_empty' &&
                          item.emptyReturnStage !== 'returned' && (
                          <span
                            className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-warning-subtle-foreground"
                            title={`Empty return — ${EMPTY_RETURN_STAGE_LABEL[item.emptyReturnStage]}`}
                          >
                            · {EMPTY_RETURN_STAGE_LABEL[item.emptyReturnStage]}
                          </span>
                        )}
                      </div>
                    </BookingField>
                  )}

                  <BookingField label="Driver">
                    <div className="flex min-w-0 items-center gap-1">
                      <span className="truncate font-semibold text-foreground transition-colors group-hover:text-primary">
                        {item.driverName}
                      </span>
                      {item.driverVerified && <VerificationBadge state="verified" size="sm" />}
                    </div>
                  </BookingField>

                  <BookingField label="Vehicle No.">
                    {/* `min-w-0` + `truncate`: a plate is one token, so a
                        narrow card broke "DT-2238-DJ" across two lines at the
                        hyphen and pushed the verified tick onto a third. */}
                    <div className="flex min-w-0 items-center gap-1">
                      <span className="truncate font-semibold text-foreground" title={item.vehicleNumber}>
                        {item.vehicleNumber}
                      </span>
                      {item.vehicleVerified && (
                        <VerificationBadge state="verified" size="sm" />
                      )}
                    </div>
                  </BookingField>

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

      {/* BOOKING PREVIEW SIDE SHEET */}
      <BookingPreviewSheet
        shipperCompany={shipmentRaw?.customerCompany}
        open={isBookingSheetOpen}
        booking={selectedBooking}
        onClose={() => setIsBookingSheetOpen(false)}
        onUpdateBooking={handleUpdateBooking}
      />
    </div>
  );
}
