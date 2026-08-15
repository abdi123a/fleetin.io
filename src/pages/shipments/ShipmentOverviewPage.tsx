import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import {
  Bell,
  Download,
  Printer,
  MoreVertical,
  FileText,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
} from '@/design-system/icons';
import {
  Badge,
  Button,
  Card,
  CornerBadge,
  PipelineFlowCard,
  VerificationBadge,
} from '@/design-system';
import { ROUTES } from '@/config/routes';
import { BookingPreviewSheet, type BookingPreviewItem, type EmptyReturnStage } from './components';
import { useShipment, useShipmentRaw } from '@/features/shipments/api/queries';
import { useBookingsForShipment } from '@/features/bookings/api/queries';
import { displayBookingStatus, statusIntentOf, type BookingRecord } from '@/features/bookings/api/bookingsService';
import { useCycles } from '@/features/empty-returns/api/queries';
import type { EmptyReturnCycleRecord } from '@/features/empty-returns/api/emptyReturnsService';
import { useProject } from '@/features/finance';

const PAGE_SIZE = 3;

/** Mirrors the backend's `DELIVERED_STATUSES` (`empty-return-status.util.ts`) — the same boundary Empty Return itself uses to decide when a booking's container is even eligible to go back. */
const DELIVERED_STATUSES = ['Arrived', 'Unloading', 'POD Submitted', 'Completed'];

/**
 * Where this booking's own container sits on its way back — purely a
 * read of Empty Return's already-real data (a matched cycle, or the
 * standalone flag), never a new status of its own. `undefined` before the
 * booking is delivered, since the question doesn't apply yet.
 */
function emptyReturnStageOf(booking: BookingRecord, cycle: EmptyReturnCycleRecord | undefined): EmptyReturnStage | undefined {
  if (!DELIVERED_STATUSES.includes(booking.status)) return undefined;
  if (cycle) return cycle.status === 'completed' ? 'returned' : 'matched';
  if (booking.emptyReturnException) return 'standalone';
  return 'waiting_match';
}

/** Compact label for the booking card's own row — the full sentence lives in the preview sheet's Empty Return card. */
const EMPTY_RETURN_STAGE_LABEL: Record<EmptyReturnStage, string> = {
  waiting_match: 'Waiting Match',
  matched: 'In Progress',
  returned: 'Returned',
  standalone: 'Standalone',
};

/** One card per real `Booking` (one per container/trip) — no more single-tier Shipment-as-one-card synthesis now that Bookings are real (Phase 2). */
function bookingToPreviewItem(booking: BookingRecord, cycle: EmptyReturnCycleRecord | undefined): BookingPreviewItem {
  const now = Date.now();
  const podStep = booking.timeline?.find((step) => step.key === 'pod_upload' && step.status === 'completed');
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
    emptyReturnCycleReference: cycle?.reference,
    podDocument: podStep
      ? { name: podStep.podFileUrl ?? 'Proof of Delivery', size: '—', uploadedAt: podStep.timestamp ?? '' }
      : null,
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
  // Money moves per shipment, never per booking — one flag applies to every
  // booking's card alike.
  const payoutReleased = Boolean(shipmentRaw?.payoutReleasedAt);

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
          Back to Shipments
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-12 px-0">

      {/* ── HEADER ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
            <span className="text-primary">Shipment Overview</span>
            {id && <span className="text-muted-foreground font-medium text-base sm:text-lg">({id})</span>}
          </h1>
          {linkedProject && (
            <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              <FolderOpen className="w-3.5 h-3.5" />
              {linkedProject.name}
              <span className="font-mono text-[11px] opacity-75">{linkedProject.reference}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(ROUTES.emptyReturns)}
            className="rounded-lg text-xs h-9 px-3 gap-2 border-border cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-primary" />
            <span>Empty Returns</span>
          </Button>
          <button
            type="button"
            className="p-2 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors relative cursor-pointer shrink-0"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full ring-2 ring-card" />
          </button>
        </div>
      </div>

      {/* ── PIPELINE FLOW ── */}
      <PipelineFlowCard bookings={bookings} onBookingClick={handleBookingClick} payoutReleased={payoutReleased} />

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
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
                  {item.podDocument && (
                    <span className="text-[10px] font-semibold text-success-subtle-foreground bg-success-subtle border border-success/20 px-1.5 py-0.5 rounded-sm flex items-center gap-1" title="POD Uploaded">
                      <FileText className="w-3 h-3" />
                      <span>POD</span>
                    </span>
                  )}
                  <Badge variant="subtle" intent={getBadgeIntent()} size="sm">{displayBookingStatus(item.status)}</Badge>
                </div>

                {/* Fields */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground shrink-0">Driver</span>
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                        {item.driverName}
                      </span>
                      {item.driverVerified && (
                        <VerificationBadge state="verified" size="sm" className="bg-transparent border-0 text-success font-bold px-0 shrink-0" />
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground shrink-0">Vehicle No.</span>
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-foreground">{item.vehicleNumber}</span>
                      {item.vehicleVerified && (
                        <VerificationBadge state="verified" size="sm" className="bg-transparent border-0 text-success font-bold px-0 shrink-0" />
                      )}
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
