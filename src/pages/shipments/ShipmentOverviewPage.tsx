import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import {
  Download,
  Printer,
  MoreVertical,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  Package,
  Route,
} from '@/design-system/icons';
import {
  Badge,
  Button,
  Card,
  CornerBadge,
  IconChip,
  VerificationBadge,
} from '@/design-system';
import { ROUTES } from '@/config/routes';
import { BookingPreviewSheet, type BookingPreviewItem, type EmptyReturnStage } from './components';
import { useShipment, useShipmentRaw } from '@/features/shipments/api/queries';
import { useBookingsForShipment } from '@/features/bookings/api/queries';
import { ShipmentReportPanel } from '@/components/reports';
import { type BookingRecord } from '@/features/bookings/api/bookingsService';
import { displayShipmentStatus, statusIntentOf } from '@/lib/shipmentStatus';
import { useCycles } from '@/features/empty-returns/api/queries';
import type { EmptyReturnCycleRecord } from '@/features/empty-returns/api/emptyReturnsService';
import { useProject } from '@/features/finance';

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
  };
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

  useEffect(() => {
    if (bookingRecords) {
      setBookings(bookingRecords.map((b) => bookingToPreviewItem(b, cyclesByBookingId.get(b.id))));
    }
  }, [bookingRecords, cyclesByBookingId]);

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

  /** The header badge speaks the same status vocabulary as the booking cards. */
  const headerIntent = statusIntentOf(mission.status);
  const headerStatusIntent =
    headerIntent === 'green'
      ? ('success' as const)
      : headerIntent === 'blue'
        ? ('info' as const)
        : headerIntent === 'orange'
          ? ('warning' as const)
          : ('default' as const);

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
      <header className="rounded-card bg-tile-teal text-tile-teal-foreground shadow-sm">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-5">
          <div className="flex min-w-0 items-center gap-3.5">
            <IconChip icon={Package} tint="on-teal" size={44} className="hidden sm:flex" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-tile-teal-foreground/80">
                Shipment Overview
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <h1 className="font-mono text-2xl font-extrabold leading-none tracking-tight text-tile-teal-foreground sm:text-[28px]">
                  {id ?? mission.id}
                </h1>
                <Badge
                  variant="solid"
                  intent={headerStatusIntent}
                  size="md"
                  className="uppercase tracking-[0.08em]"
                >
                  {displayShipmentStatus(mission.status, 'shipment')}
                </Badge>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-tile-teal-foreground/85">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <Route className="w-3.5 h-3.5 shrink-0" aria-hidden />
                  <span className="truncate">
                    {mission.pickupLocation.name} → {mission.deliveryLocation.name}
                  </span>
                </span>
                {linkedProject && (
                  <>
                    <span aria-hidden className="h-3 w-px bg-tile-teal-foreground/30" />
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
             * On a filled tile the action inverts: white plate, teal ink — the
             * same pair `IconChip`'s `on-teal` uses. Literal white, not
             * `bg-card`, because the tile holds its colour in both themes and a
             * dark-mode card on it would read as a hole.
             */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate(ROUTES.emptyReturns)}
              leadingIcon={<RotateCcw />}
              className="cursor-pointer bg-white text-tile-teal shadow-xs hover:bg-white/90 active:bg-white/80"
            >
              Empty Returns
            </Button>
          </div>
        </div>
      </header>

      {/* ── BOOKINGS CARD ── */}
      <Card className="p-4 sm:p-5 rounded-lg border border-border/80 bg-card space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-foreground text-sm sm:text-base">Bookings</h3>
          <Badge variant="solid" intent="primary" size="sm">
            {bookings.length}/{bookings.length}
          </Badge>
        </div>

        {/* Booking Items */}
        <div className={`grid grid-cols-1 gap-2.5 sm:grid-cols-2 ${bookingColumnsClass}`}>
          {pagedBookings.map(item => {
            const getBadgeIntent = () => {
              switch (item.statusIntent) {
                case 'green': return 'success';
                case 'blue': return 'info';
                case 'orange': return 'warning';
                default: return 'default';
              }
            };

            return (
              <div
                key={item.id}
                onClick={() => handleBookingClick(item)}
                className="relative overflow-hidden rounded-lg border border-border/80 bg-card hover:border-primary/50 transition cursor-pointer p-3 pt-9 group shadow-2xs"
              >
                {/* Corner Badge */}
                <div className="absolute top-0 left-0">
                  <CornerBadge label={`Booking No. ${item.bookingNumber}`} intent="teal" position="top" />
                </div>

                {/* Status Badge */}
                <div className="absolute top-2 right-2 flex items-center gap-1.5">
                  <Badge variant="subtle" intent={getBadgeIntent()} size="sm">{displayShipmentStatus(item.status)}</Badge>
                </div>

                {/* Fields */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground shrink-0">Driver</span>
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                        {item.driverName}
                      </span>
                      {item.driverVerified && <VerificationBadge state="verified" size="sm" />}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground shrink-0">Vehicle No.</span>
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-foreground">{item.vehicleNumber}</span>
                      {item.vehicleVerified && <VerificationBadge state="verified" size="sm" />}
                    </div>
                  </div>

                  {item.emptyReturnStage && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground shrink-0">Empty Return</span>
                      <span
                        className={`font-semibold ${
                          item.emptyReturnStage === 'returned' ? 'text-success' : 'text-warning-subtle-foreground'
                        }`}
                      >
                        {EMPTY_RETURN_STAGE_LABEL[item.emptyReturnStage]}
                      </span>
                    </div>
                  )}
                </div>

                <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
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

        {/* Digital Bill-T */}
        <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Digital Bill-T</span>
          <div className="flex items-center gap-2">
            <button type="button" className="p-1 hover:text-foreground cursor-pointer">
              <Download className="w-4 h-4" />
            </button>
            <button type="button" className="p-1 hover:text-foreground cursor-pointer">
              <Printer className="w-4 h-4" />
            </button>
          </div>
        </div>
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
        open={isBookingSheetOpen}
        booking={selectedBooking}
        onClose={() => setIsBookingSheetOpen(false)}
        onUpdateBooking={handleUpdateBooking}
      />
    </div>
  );
}
