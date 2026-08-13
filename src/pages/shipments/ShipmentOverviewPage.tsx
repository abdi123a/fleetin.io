import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
import { BookingPreviewSheet, type BookingPreviewItem } from './components';
import { useShipment } from '@/features/shipments/api/queries';
import { getProjectLink } from '@/lib/operations/shipmentProjectLink';
import { useFinanceStore } from '@/stores/finance.store';
import type { Mission, MissionStatus } from '@/types/mission';

const PAGE_SIZE = 3;

/**
 * `BookingPreviewItem.status`/`statusIntent` speak a display-only vocabulary
 * (`Dispatched`, `Port Entry`, `Empty Returned`, …) that predates — and has
 * no 1:1 mapping to — the real `MissionStatus` ladder. This buckets the real
 * status into the closest intent color; the label itself stays the real
 * status string rather than inventing a fake equivalent.
 */
function statusIntentForMission(status: MissionStatus): 'green' | 'orange' | 'blue' | 'slate' {
  if (status === 'Completed' || status === 'POD Submitted') return 'green';
  if (status === 'En Route' || status === 'Arrived') return 'blue';
  if (status === 'Pending' || status === 'Assigned' || status === 'Driver Assigned' || status === 'Payment Pending') {
    return 'orange';
  }
  return 'slate';
}

/** Maps the single real shipment into the one-element list this page's card grid/pipeline UI expects. */
function missionToBookingPreview(mission: Mission): BookingPreviewItem {
  const podStep = mission.timeline.find((step) => step.key === 'pod_upload' && step.status === 'completed');
  return {
    id: mission.id,
    bookingNumber: mission.bookingId.replace('BKG-', ''),
    partnerName: mission.transporter.company,
    driverName: mission.driver?.name ?? 'Unassigned',
    driverPhone: mission.driver?.phone,
    driverVerified: mission.driver?.isVerified ?? false,
    vehicleNumber: mission.assignedTruck?.registrationNumber ?? '—',
    vehicleType: mission.assignedTruck?.vehicleType,
    vehicleVerified: mission.assignedTruck?.isVerified ?? false,
    status: mission.status,
    statusIntent: statusIntentForMission(mission.status),
    podDocument: podStep
      ? { name: podStep.podFileUrl ?? 'Proof of Delivery', size: '—', uploadedAt: podStep.timestamp ?? '' }
      : null,
  };
}

export function ShipmentOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: mission, isLoading, isError } = useShipment(id);

  const [selectedBooking, setSelectedBooking] = useState<BookingPreviewItem | null>(null);
  const [isBookingSheetOpen, setIsBookingSheetOpen] = useState(false);
  const [bookingPage, setBookingPage] = useState(1);

  const [bookings, setBookings] = useState<BookingPreviewItem[]>([]);

  // The tag recorded at creation time (see CreateShipmentModal) — frontend-
  // only until the Finance module has a real backend project to join on.
  const linkedProjectId = useMemo(() => (id ? getProjectLink(id) : null), [id]);
  const linkedProject = useFinanceStore((state) =>
    linkedProjectId ? state.projects.find((project) => project.id === linkedProjectId) : undefined,
  );

  // The real shipment loads asynchronously; once it does, it becomes the
  // page's single booking card (see missionToBookingPreview's doc comment —
  // there is no Booking-tier split, single-tier Shipment maps to one card).
  useEffect(() => {
    if (mission) setBookings([missionToBookingPreview(mission)]);
  }, [mission]);

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
      <PipelineFlowCard bookings={bookings} onBookingClick={handleBookingClick} />

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
                  <Badge variant="subtle" intent={getBadgeIntent()} size="sm">{item.status}</Badge>
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
