import type { StatusIntent } from '@/design-system/primitives/Layout/statusIntent';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookingDebriefDialog,
  debriefSubjectFor,
  emptyDebrief,
  type DebriefDraft,
} from '@/components/bookings';
import {
  User,
  Truck,
  Phone,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Check,
  Building2,
  Calendar,
  ArrowRight,
  Pencil,
  RotateCcw,
  AlertTriangle,
  Package,
  ContainerIcon,
  Star,
} from '@/design-system/icons';
import { Avatar, Combobox, IconChip } from '@/design-system';
import {
  Badge,
  Button,
  Card,
  CloseButton,
  ContainerStateTag,
  useConfirm,
  Select,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  VerificationBadge,
} from '@/design-system';
import { ROUTES } from '@/config/routes';
import { BOOKING_LADDER } from '@/features/bookings/api/bookingsService';
import { RecordRaise } from '@/features/workspace';
import { displayShipmentStatus, shipmentStepsFor, statusIntentOf, stepRungFor } from '@/lib/shipmentStatus';
import {
  CONTAINER_STATE_BADGE_CLASS,
  CONTAINER_STATE_BADGE_INTENT,
  CONTAINER_STATE_SENTENCE,
  containerStateOf,
} from '@/lib/containerState';
import {
  useSettleBookingStatus,
  useUpdateBooking,
  useUpdateBookingStatus,
} from '@/features/bookings/api/queries';
import { useVehicles } from '@/features/vehicles/api/queries';
import { useDrivers } from '@/features/drivers/api/queries';
import { usePartners } from '@/features/partners/api/queries';
import { useEmptyReturnStore } from '@/stores/emptyReturn.store';
import { useConfirmStandaloneReturn } from '@/features/empty-returns/api/queries';
import { cn, formatDate } from '@/utils';

/**
 * Where this booking's own empty container sits, once delivered — a
 * booking's real `status` (the backend ladder, business rules, invoicing)
 * never advances past "Completed" for this; the container physically going
 * back is tracked by Empty Return separately (a matched cycle, or a
 * standalone flag) and only ever shown here, never used to gate anything.
 * Undefined before the booking is delivered — the question doesn't apply yet.
 */
export type EmptyReturnStage = 'awaiting_empty' | 'waiting_match' | 'matched' | 'returned' | 'standalone';

export interface BookingPreviewItem {
  id: string;
  bookingNumber: string;
  /** The container this specific booking is carrying — the identifier to search by in Empty Return's Create Match, the shipment's own booking cards, and everywhere else this booking gets cross-referenced. */
  containerNumber?: string;
  partnerId?: string;
  partnerName?: string;
  vehicleId?: string;
  driverId?: string;
  driverName: string;
  driverPhone?: string;
  driverVerified: boolean;
  vehicleNumber: string;
  vehicleType?: string;
  vehicleVerified: boolean;
  status: string;
  statusIntent: StatusIntent;
  step?: string;
  startDate?: string;
  startTime?: string;
  finishDate?: string;
  finishTime?: string;
  emptyReturnStage?: EmptyReturnStage;
  /** When the box was emptied — recorded on the "Empty Ready" rung, and what the return counts from. */
  emptyReadyAt?: string;
  /** The matched cycle's own reference (`CYC-2026-#####`) — set whenever `emptyReturnStage` is `matched` or `returned`, so the card can jump straight to it. */
  emptyReturnCycleReference?: string;
  /** What the operator said when they marked this delivered — see `BookingStatusPicker`. */
  driverRating?: number | null;
  driverRatingReliability?: number | null;
  driverRatingPunctuality?: number | null;
  driverRatingProfessionalism?: number | null;
  driverNote?: string | null;
  driverRatedByName?: string | null;
  driverRatedAt?: string | null;
}

interface BookingPreviewSheetProps {
  open: boolean;
  booking: BookingPreviewItem | null;
  onClose: () => void;
  onUpdateBooking: (updatedBooking: BookingPreviewItem) => void;
  /** The shipper this container belongs to — who the closing debrief asks about. */
  shipperCompany?: string;
}

/** The three axes the debrief asks for, in the order `BookingStatusPicker` asks them. */
const DEBRIEF_READOUT = [
  { key: 'driverRatingReliability', label: 'Reliability' },
  { key: 'driverRatingPunctuality', label: 'Punctuality' },
  { key: 'driverRatingProfessionalism', label: 'Professionalism' },
] as const;

export function BookingPreviewSheet({
  open,
  booking,
  shipperCompany,
  onClose,
  onUpdateBooking,
}: BookingPreviewSheetProps) {
  const navigate = useNavigate();
  const focusEmptyReturnRecord = useEmptyReturnStore((state) => state.focusRecord);
  const [statusSuccessMsg, setStatusSuccessMsg] = useState('');
  const [statusErrorMsg, setStatusErrorMsg] = useState('');
  /* The status the picker is waiting on an "emptied at" answer for, and the
     booking it was asked about — the sheet is reused for every booking, so a
     prompt left open must not carry over to the next one. */
  /* Every rung asks when it happened, not just the empty-ready one. The office
     is always behind the yard: a container is picked up at 06:40 and typed in
     at 11:15, and a report built on the typing time measures the office, not
     the run. */
  const [pendingStatus, setPendingStatus] = useState<{ bookingId: string; target: string } | null>(null);
  const [occurredDate, setOccurredDate] = useState('');
  const [occurredTime, setOccurredTime] = useState('');
  const [isEditingPartner, setIsEditingPartner] = useState(false);
  const [isEditingVehicle, setIsEditingVehicle] = useState(false);
  const [isEditingDriver, setIsEditingDriver] = useState(false);
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const [debrief, setDebrief] = useState<DebriefDraft | null>(null);
  const updateBookingStatus = useUpdateBookingStatus();
  const settle = useSettleBookingStatus();
  const updateBooking = useUpdateBooking();
  const confirmStandaloneReturn = useConfirmStandaloneReturn();
  // Every registered partner — who to assign as this booking's transporter.
  const { data: partners } = usePartners({ limit: 200 });
  // The transporter's own fleet only — a vehicle/driver belongs to one
  // partner, and this booking's partner is who the client told us is running
  // it. A placeholder id when no partner is assigned yet returns an empty
  // list rather than every vehicle/driver in the system.
  const { data: partnerVehicles } = useVehicles({ partnerId: booking?.partnerId ?? '__unassigned__' });
  const { data: partnerDrivers } = useDrivers({ partnerId: booking?.partnerId ?? '__unassigned__' });
  const { confirm, confirmDialog } = useConfirm();

  if (!booking) return null;

  const hasDriver = Boolean(booking.driverId);
  const hasVehicle = Boolean(booking.vehicleId);

  /**
   * The job is over — nothing on this booking is editable any more.
   *
   * "Completed" is the whole test for both kinds of cargo, because a
   * containerized booking cannot reach it until its empty is back at the
   * depot (`isEmptyReturnSettled`, enforced in `BookingsService`), while a
   * bulk load has no box to wait for and completes at delivery. Cancelled and
   * failed jobs are closed too — the record of what happened, not a form.
   */
  const isClosed = ['Completed', 'Cancelled', 'Failed'].includes(booking.status);

  // A real fleet has expired paperwork in it more often than not — hiding
  // those trucks/drivers made the whole picker read as "empty" for any
  // partner whose one driver or vehicle happened to lapse. Same advisory
  // stance as the payout window: offer everyone, flag what's expired, let
  // the dispatcher decide. The post-assignment badges (`vehicleVerified`,
  // `driverVerified`) already show "Documents need review" for these.
  const isVehicleVerified = (vehicle: { registrationExpiry: string; insuranceExpiry: string }) =>
    new Date(vehicle.registrationExpiry).getTime() > Date.now() &&
    new Date(vehicle.insuranceExpiry).getTime() > Date.now();
  const isDriverVerified = (driver: { licenseExpiry: string }) =>
    new Date(driver.licenseExpiry).getTime() > Date.now();

  const assignableVehicles = [...(partnerVehicles?.items ?? [])].sort(
    (a, b) => Number(isVehicleVerified(b)) - Number(isVehicleVerified(a)),
  );
  const assignableDrivers = [...(partnerDrivers?.items ?? [])].sort(
    (a, b) => Number(isDriverVerified(b)) - Number(isDriverVerified(a)),
  );

  const handleAssignPartner = (partnerId: string) => {
    if (!partnerId) return;
    updateBooking.mutate(
      { id: booking.id, payload: { partnerId } },
      {
        onSuccess: (updated) => {
          /* Every fleet field is re-read from the response rather than kept
           * from the old booking. Moving to another transporter releases the
           * truck and the driver server-side — they belong to the carrier that
           * just left the job — so spreading the previous values back over the
           * top left the sheet showing Awdal's plate under Dikhil's name. */
          onUpdateBooking({
            ...booking,
            partnerId: updated.partnerId ?? undefined,
            partnerName: updated.partner?.companyLegalName,
            vehicleId: updated.vehicleId ?? undefined,
            vehicleNumber: updated.vehicle?.plateNumber ?? '—',
            vehicleType: updated.vehicle?.truckType,
            vehicleVerified: updated.vehicle
              ? new Date(updated.vehicle.registrationExpiry).getTime() > Date.now() &&
                new Date(updated.vehicle.insuranceExpiry).getTime() > Date.now()
              : false,
            driverId: updated.driverId ?? undefined,
            driverName: updated.driver?.fullName ?? 'Unassigned',
            driverPhone: updated.driver?.phone,
            driverVerified: updated.driver
              ? new Date(updated.driver.licenseExpiry).getTime() > Date.now()
              : false,
            status: updated.status,
            statusIntent: statusIntentOf(updated.status),
          });
          setIsEditingPartner(false);
        },
      },
    );
  };

  const handleAssignVehicle = (vehicleId: string) => {
    updateBooking.mutate(
      { id: booking.id, payload: { vehicleId: vehicleId || null } },
      {
        onSuccess: (updated) => {
          onUpdateBooking({
            ...booking,
            vehicleId: updated.vehicleId ?? undefined,
            vehicleNumber: updated.vehicle?.plateNumber ?? '—',
            vehicleType: updated.vehicle?.truckType,
            vehicleVerified: updated.vehicle
              ? new Date(updated.vehicle.registrationExpiry).getTime() > Date.now() &&
                new Date(updated.vehicle.insuranceExpiry).getTime() > Date.now()
              : false,
            status: updated.status,
            statusIntent: statusIntentOf(updated.status),
          });
          setIsEditingVehicle(false);
        },
      },
    );
  };

  const handleAssignDriver = (driverId: string) => {
    updateBooking.mutate(
      { id: booking.id, payload: { driverId: driverId || null } },
      {
        onSuccess: (updated) => {
          onUpdateBooking({
            ...booking,
            driverId: updated.driverId ?? undefined,
            driverName: updated.driver?.fullName ?? 'Unassigned',
            driverPhone: updated.driver?.phone,
            driverVerified: updated.driver ? new Date(updated.driver.licenseExpiry).getTime() > Date.now() : false,
            status: updated.status,
            statusIntent: statusIntentOf(updated.status),
          });
          setIsEditingDriver(false);
        },
      },
    );
  };

  /**
   * What a status still needs before it may be set — the frontend's copy of the
   * guards in `BookingsService.updateStatus`. A status must never claim a fact
   * the booking does not have, and saying so on the option itself turns a
   * request the backend would reject into an answer before it is clicked.
   *
   * Direction-independent on purpose: the guards are checked against the status
   * being written, so walking *back* to "POD Submitted" needs a POD just as
   * much as walking forward to it does.
   */
  const requirementFor = (status: string): string | null => {
    if (status === 'Driver Assigned' && !hasDriver) return 'assign a driver first';
    if ((status === 'Heading to Pickup' || status === 'En Route') && !hasVehicle) return 'assign a vehicle first';
    /* "Empty Returned" is no longer blocked on the Empty Returns module doing
       it first. The dispatcher on this booking is the person who watches the
       box arrive, so picking the rung records the return itself — the backend
       writes the cycle's `returnedAt` from the moment reported here, then
       closes the booking. Empty Return still closes it by itself when a
       matched cycle runs; this is the second door, not a replacement. */
    if (status === 'Completed' && !hasVehicle) return 'assign a vehicle first';
    return null;
  };

  /**
   * The ladder this particular booking walks.
   *
   * A bulk or machinery load has no box, so neither empty-return rung is a
   * moment in its life: there is nothing to strip and nothing to collect. Such
   * a load runs to `POD Submitted` and then closes, which the backend allows
   * directly — `Completed` is one of its two always-reachable edges.
   *
   * Dropping only `Empty Ready` here, as this did, left the picker offering
   * "Empty Picked Up" to a booking with no box — and produced the one path the
   * backend cannot honour. `ladderPathTo` walks *every* rung between here and
   * the target, so a boxless booking at `POD Submitted` asked for the edge
   * `POD Submitted → Empty Picked Up`, which is not in the backend's chain
   * (`POD Submitted → Empty Ready → Empty Picked Up → Completed`) and was
   * refused. The forced `Completed` edge the old comment relied on was never
   * reached, because the walk never got that far.
   */
  const EMPTY_RETURN_RUNGS = ['Empty Ready', 'Empty Picked Up'];
  const ladder = booking.containerNumber
    ? BOOKING_LADDER
    : BOOKING_LADDER.filter((status) => !EMPTY_RETURN_RUNGS.includes(status));

  /* What the operator picks between. A bulk load gets its own three rungs —
     Created, Picked Up, Delivered — where Delivered *is* the end of the job;
     see `BULK_SHIPMENT_STEPS`. The rungs in between are still walked and still
     stamped, so the reports keep a real delivery time. */
  const steps = shipmentStepsFor(Boolean(booking.containerNumber));
  /* The step the booking currently sits under, so a booking at "At Pickup"
     shows "Picked Up" selected rather than an empty field. */
  const currentStep = stepRungFor(booking.status);

  /**
   * The statuses actually written to get from here to `target`.
   *
   * Backwards is one write — the backend takes any lower rung as a correction.
   * Forwards is every rung in between, because the ladder only moves a step at
   * a time and each rung is a real event with its own timeline stamp. Skipping
   * them by writing the target alone would also skip their guards, which is how
   * a booking could reach "Completed" with no POD ever attached.
   */
  const ladderPathTo = (target: string): string[] => {
    const from = ladder.indexOf(booking.status);
    const to = ladder.indexOf(target);
    if (from < 0 || to < 0 || to < from) return [target];
    return ladder.slice(from + 1, to + 1);
  };

  /** The first rung on the way to `target` that cannot be written yet, if any. */
  const blockerFor = (target: string): { status: string; requirement: string } | null => {
    for (const status of ladderPathTo(target)) {
      const requirement = requirementFor(status);
      if (requirement) return { status, requirement };
    }
    return null;
  };

  /**
   * Write the ladder out to `target` — forward, backward, or several rungs at
   * once. One control, no vocabulary of "advance" versus "correct": the
   * dispatcher says where the container is and the ladder is walked to get
   * there.
   */
  const applyStatus = async (target: string, occurredAt: string) => {
    setStatusErrorMsg('');
    setStatusSuccessMsg('');

    /* Whatever was actually written, so a rung that fails half-way up leaves
       the sheet showing where the booking really is rather than where the
       click was aiming. */
    let reached = booking.status;
    try {
      for (const status of ladderPathTo(target)) {
        /* Re-read once when the walk is over, not once per rung — see
           `useSettleBookingStatus`. */
        await updateBookingStatus.mutateAsync({
          id: booking.id,
          status,
          /* Every rung on the path takes the reported moment — the operator is
             reporting one event, and the rungs walked to reach it are that same
             event's bookkeeping. The backend writes it as the timeline entry's
             timestamp, which is what the reports measure from. */
          occurredAt: occurredAt,
        });
        reached = status;
      }
      setStatusSuccessMsg(`Status set to "${target}"`);
      setTimeout(() => setStatusSuccessMsg(''), 3000);
      /* The same debrief the cards' status picker asks, on the same rungs.
         Moving a booking from this sheet used to skip it entirely, so whether
         anybody was asked how the job went depended on which of the two status
         controls the operator happened to reach for. */
      const subject = debriefSubjectFor(target, reached);
      if (subject) setDebrief(emptyDebrief(subject));
    } catch (error) {
      setStatusErrorMsg(error instanceof Error ? error.message : 'The status could not be updated.');
    } finally {
      if (reached !== booking.status) {
        settle();
        const startedReturn = ladderPathTo(target).includes('Empty Ready') && reached !== booking.status;
        onUpdateBooking({
          ...booking,
          status: reached,
          statusIntent: statusIntentOf(reached),
          emptyReadyAt: startedReturn ? occurredAt : booking.emptyReadyAt,
          emptyReturnStage:
            startedReturn && booking.emptyReturnStage === 'awaiting_empty'
              ? 'waiting_match'
              : booking.emptyReturnStage,
        });
      }
    }
  };

  /**
   * Every rung asks when it happened before it is written.
   *
   * A status is a report of the world and the office is always behind the
   * yard — the box is picked up at 06:40 and typed in at 11:15. Reports are
   * built entirely from these timestamps (`missionReport`, `monthlyReport`),
   * so recording the typing time would have them measuring how quickly
   * somebody reached a screen instead of how the run actually went.
   *
   * The dialog opens on now, which is the right answer whenever the operator
   * is at the screen as it happens; it is a default, not an assumption.
   */
  const handleSetStatus = (target: string) => {
    if (!target || target === booking.status) return;
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    setOccurredDate(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
    setOccurredTime(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
    setPendingStatus({ bookingId: booking.id, target });
  };

  const confirmStatusChange = () => {
    if (!pendingStatus || !occurredDate || !occurredTime) return;
    const target = pendingStatus.target;
    const occurredAt = new Date(`${occurredDate}T${occurredTime}`);
    if (Number.isNaN(occurredAt.getTime())) return;
    // Nothing has happened in the future — every duration off it would be negative.
    if (occurredAt.getTime() > Date.now()) {
      setStatusErrorMsg('That moment has not happened yet — pick a date and time in the past.');
      return;
    }
    setPendingStatus(null);
    void applyStatus(target, occurredAt.toISOString());
  };

  /** What the dialog is asking about, in the operator's own vocabulary — the
      picker's own label, so a boxless load is asked about "Completed" rather
      than about an empty that was never on the truck. */
  const pendingStepLabel = pendingStatus
    ? (steps.find((step) => step.rung === pendingStatus.target)?.label ??
      displayShipmentStatus(pendingStatus.target))
    : '';

  /**
   * Closing a booking without delivering it. Off the ladder and out of the
   * picker's flow on purpose: this is a decision with money attached, not a
   * rung, and the backend never walks back out of it.
   */
  const handleCloseBooking = async (status: 'Cancelled' | 'Failed') => {
    const ok = await confirm({
      title: status === 'Cancelled' ? 'Cancel this booking?' : 'Mark this booking failed?',
      description:
        `Booking #${booking.bookingNumber} will be closed as ${status.toLowerCase()} and cannot be reopened. ` +
        'Its shipment is re-read from the bookings underneath it.',
      confirmLabel: status === 'Cancelled' ? 'Cancel booking' : 'Mark failed',
    });
    if (!ok) return;
    setStatusErrorMsg('');
    setStatusSuccessMsg('');
    try {
      await updateBookingStatus.mutateAsync({ id: booking.id, status });
      onUpdateBooking({ ...booking, status, statusIntent: statusIntentOf(status) });
    } catch (error) {
      setStatusErrorMsg(error instanceof Error ? error.message : 'The status could not be updated.');
    }
  };

  /**
   * What is in the box right now — teal full, brand yellow empty, grey once it
   * is home. `null` on a bulk load, which has no container to be any of them.
   */
  const containerState = containerStateOf(booking.status, Boolean(booking.containerNumber));

  const getStatusBadge = () => {
    const label = displayShipmentStatus(booking.status);
    /* A container's own status is coloured by what is inside it, not by how far
       along the ladder it is — the same scale the card in the grid behind this
       sheet uses, so opening a booking never recolours it. */
    if (containerState) {
      /* A container, not a parcel — see `MissionStatusBadge`. */
      return (
        <Badge
          variant="subtle"
          intent={CONTAINER_STATE_BADGE_INTENT[containerState]}
          size="md"
          className={`gap-1 font-semibold ${CONTAINER_STATE_BADGE_CLASS[containerState]}`}
          title={CONTAINER_STATE_SENTENCE[containerState]}
        >
          <ContainerIcon className="w-3.5 h-3.5" />
          {label}
        </Badge>
      );
    }
    switch (booking.statusIntent) {
      case 'green':
        return (
          <Badge variant="subtle" intent="success" size="md" className="gap-1 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {label}
          </Badge>
        );
      case 'blue':
        return (
          <Badge variant="subtle" intent="info" size="md" className="gap-1 font-semibold">
            <Truck className="w-3.5 h-3.5" />
            {label}
          </Badge>
        );
      case 'orange':
        return (
          <Badge variant="subtle" intent="warning" size="md" className="gap-1 font-semibold">
            <Clock className="w-3.5 h-3.5" />
            {label}
          </Badge>
        );
      default:
        return (
          <Badge variant="subtle" intent="default" size="md" className="gap-1 font-semibold">
            {label}
          </Badge>
        );
    }
  };

  return (
    <>
    {confirmDialog}
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (isOpen) return;
        setPendingStatus(null);
        onClose();
      }}
    >
      <SheetContent side="right" hideCloseButton className="w-full sm:max-w-md md:max-w-lg p-0 flex flex-col h-full bg-background overflow-hidden border-l border-border shadow-2xl">
        <SheetTitle className="sr-only">Booking Preview #{booking.bookingNumber}</SheetTitle>
        <SheetDescription className="sr-only">
          Booking details, transporter, driver, vehicle, status and POD.
        </SheetDescription>

        {/* ── HEADER ── */}
        <div className="p-4 bg-card border-b border-border/80 flex items-center justify-between shrink-0">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Booking Preview</span>
            <h2 className="text-xl font-extrabold tracking-tight text-foreground">
              Booking #{booking.bookingNumber}
            </h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Package className="w-3.5 h-3.5 shrink-0" />
              {booking.containerNumber ? (
                <span className="font-mono tracking-wide text-foreground">{booking.containerNumber}</span>
              ) : (
                <span className="italic">No container number on file</span>
              )}
              {containerState && <ContainerStateTag state={containerState} status={booking.status} small />}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <RecordRaise
              recordType="BOOKING"
              recordId={booking.id}
              recordRef={booking.bookingNumber}
              label={booking.containerNumber}
              size="sm"
            />
            <CloseButton onClick={onClose} />
          </div>
        </div>

        {/* ── SCROLLABLE BODY CONTENT ── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* 1. STATUS — where the booking is, and the control that moves it.
              First thing in the sheet because it is why the sheet gets opened:
              the dispatcher has news about this box and wants to record it.

              One row, not a titled card: a card, a badge and a select were
              three ways of saying "Delivered" stacked on top of each other,
              and the select says it best because it is also the way to change
              it. The container tag in the masthead already carries the colour. */}
          <div className="flex items-center justify-between gap-2">
            <h3 className="shrink-0 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {updateBookingStatus.isPending ? 'Saving…' : isClosed ? 'Final Status' : 'Status'}
            </h3>
            {isClosed ? (
              /* A closed job states its outcome and offers nothing. */
              /* The outcome sentence rides along on the same row — a closed
                 booking is read, not worked, so it needs a line not a card. */
              <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                <span className="truncate text-xs text-muted-foreground">
                  {booking.status === 'Completed'
                    ? booking.containerNumber
                      ? 'Delivered, empty back'
                      : 'Delivered'
                    : 'Closed without delivering'}
                </span>
                {getStatusBadge()}
              </div>
            ) : (
              /* Sized to the rung it is showing, not to the panel: a field
                 stretched across the sheet reads as the main event, and the
                 main event is the run, not the dropdown. Capped so the long
                 "blocked because…" options cannot drag it wide again. */
              <Select
                value={currentStep}
                disabled={updateBookingStatus.isPending}
                aria-label="Booking status"
                onChange={(event) => handleSetStatus(event.target.value)}
                containerClassName="w-auto"
                className="h-8 w-auto max-w-[190px] rounded-md pl-3 pr-9 text-xs font-semibold"
              >
                {/* Off-ladder statuses (`Payment Pending`) would otherwise
                    leave the field showing a value it has no option for. */}
                {!steps.some((step) => step.rung === currentStep) && (
                  <option value={currentStep}>{displayShipmentStatus(booking.status)}</option>
                )}
                {steps.map((step, index) => {
                  const blocker = step.rung === currentStep ? null : blockerFor(step.rung);
                  return (
                    <option key={step.rung} value={step.rung} disabled={Boolean(blocker)}>
                      {index + 1}. {blocker ? `${step.label} — ${blocker.requirement}` : step.label}
                    </option>
                  );
                })}
              </Select>
            )}
          </div>

          {/* ── THE DELIVERY DEBRIEF ──
              What the operator said when they marked this delivered. Read here
              because this sheet is where one booking is examined; the rating
              also has to be *findable*, or asking for it was pointless.

              Deliberately labelled as somebody's opinion. The stars elsewhere
              in the app are computed from timestamps (`@/lib/rating`), and a
              hand-entered score sitting in the same visual language as a derived
              one would quietly claim to be the same kind of fact. */}
          {(booking.driverNote || booking.driverRating) && (
            <div className="rounded-lg border border-border/80 bg-card p-3 shadow-2xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-foreground">Delivery debrief</span>
                {/* The person, not "the operator". A debrief is somebody's
                    opinion, and an opinion with no name on it is worth less —
                    you cannot go and ask an anonymous one what they meant. */}
                <span className="text-[10px] text-muted-foreground">
                  {booking.driverRatedByName
                    ? `by ${booking.driverRatedByName}`
                    : 'recorded by the operator'}
                  {booking.driverRatedAt
                    ? ` · ${formatDate(booking.driverRatedAt, 'dateTime')}`
                    : ''}
                </span>
              </div>

              {DEBRIEF_READOUT.map((axis) => {
                const score = booking[axis.key];
                if (!score) return null;
                return (
                  <div key={axis.key} className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-[11px] text-muted-foreground">{axis.label}</span>
                    <span className="flex shrink-0 items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          aria-hidden
                          className={cn(
                            'size-3.5',
                            star <= score ? 'fill-warning text-warning' : 'text-border-strong',
                          )}
                        />
                      ))}
                      <span className="sr-only">{score} out of 5</span>
                    </span>
                  </div>
                );
              })}

              {/* A booking scored before the debrief asked per-axis has only the
                  overall. Showing it as "Overall" is the honest label — the
                  alternative was a rating that exists in the record and nowhere
                  on the screen. */}
              {!DEBRIEF_READOUT.some((axis) => booking[axis.key]) && booking.driverRating ? (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-[11px] text-muted-foreground">Overall</span>
                  <span className="flex shrink-0 items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        aria-hidden
                        className={cn(
                          'size-3.5',
                          star <= (booking.driverRating ?? 0)
                            ? 'fill-warning text-warning'
                            : 'text-border-strong',
                        )}
                      />
                    ))}
                    <span className="sr-only">{booking.driverRating} out of 5</span>
                  </span>
                </div>
              ) : null}

              {booking.driverNote && (
                <p className="mt-2.5 border-t border-border/60 pt-2.5 text-xs leading-relaxed text-foreground">
                  “{booking.driverNote}”
                </p>
              )}
            </div>
          )}

          {/* Toast / Feedback Messages */}
          {statusSuccessMsg && (
            <div className="p-3 bg-success-subtle border border-success/30 text-success-subtle-foreground rounded-lg text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
              <Check className="w-4 h-4 shrink-0 text-success-subtle-foreground" />
              <span>{statusSuccessMsg}</span>
            </div>
          )}

          {/* Why a status change did not take — the backend's own sentence.
              Rejections used to fail silently, so a blocked click read as the
              control simply not working. */}
          {statusErrorMsg && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive-subtle p-3 text-xs font-semibold text-destructive-subtle-foreground animate-in fade-in slide-in-from-top-1">
              <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
              <span>{statusErrorMsg}</span>
            </div>
          )}

          {/* START & FINISH DATE / TIME */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                <span>Schedule & Dwell Timing</span>
              </h3>
              {!isEditingSchedule && !isClosed && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  leadingIcon={<Pencil className="size-3" />}
                  onClick={() => setIsEditingSchedule(true)}
                >
                  Edit
                </Button>
              )}
            </div>

            <Card className="p-3 rounded-lg border border-border/80 bg-card space-y-3 shadow-2xs">
              {isEditingSchedule ? (
                <>
                  {/* START DATE & TIME */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-success" />
                      Start Date & Time
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={booking.startDate || '2026-07-28'}
                        onChange={(e) => onUpdateBooking({ ...booking, startDate: e.target.value })}
                        className="w-full h-9 px-2.5 py-1 text-xs font-medium bg-background border border-border/80 rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                      />
                      <input
                        type="time"
                        value={booking.startTime || '08:00'}
                        onChange={(e) => onUpdateBooking({ ...booking, startTime: e.target.value })}
                        className="w-full h-9 px-2.5 py-1 text-xs font-medium bg-background border border-border/80 rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="border-t border-border/60" />

                  {/* FINISH DATE & TIME */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                      Finish Date & Time
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={booking.finishDate || '2026-07-29'}
                        onChange={(e) => onUpdateBooking({ ...booking, finishDate: e.target.value })}
                        className="w-full h-9 px-2.5 py-1 text-xs font-medium bg-background border border-border/80 rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                      />
                      <input
                        type="time"
                        value={booking.finishTime || '17:00'}
                        onChange={(e) => onUpdateBooking({ ...booking, finishTime: e.target.value })}
                        className="w-full h-9 px-2.5 py-1 text-xs font-medium bg-background border border-border/80 rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <Button size="sm" variant="outline" className="text-xs" onClick={() => setIsEditingSchedule(false)}>
                      Done
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="w-2 h-2 rounded-full bg-success" />
                      Start
                    </span>
                    <span className="font-semibold text-foreground">
                      {booking.startDate || '2026-07-28'} · {booking.startTime || '08:00'}
                    </span>
                  </div>
                  <div className="border-t border-border/60" />
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                      Finish
                    </span>
                    <span className="font-semibold text-foreground">
                      {booking.finishDate || '2026-07-29'} · {booking.finishTime || '17:00'}
                    </span>
                  </div>
                </>
              )}
            </Card>
          </div>

          {/* 2. PARTNER, DRIVER & TRUCK INFO CARDS */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Transporter & Fleet</h3>

            {/* PARTNER CARD */}
            <Card className="p-3 rounded-lg border border-border/80 bg-card space-y-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <IconChip icon={Building2} tint="amber" size={36} />
                  <div>
                    <h4 className="font-bold text-foreground text-sm">{booking.partnerName ?? 'No transporter assigned'}</h4>
                    <span className="text-xs text-muted-foreground">Registered transporter</span>
                  </div>
                </div>
                {booking.partnerName && !isEditingPartner && (
                  <Badge variant="subtle" intent="info" size="sm" className="text-[10px]">Transporter</Badge>
                )}
                {!isEditingPartner && !isClosed && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    leadingIcon={<Pencil className="size-3" />}
                    onClick={() => setIsEditingPartner(true)}
                  >
                    {booking.partnerName ? 'Change' : 'Assign'}
                  </Button>
                )}
              </div>

              {isEditingPartner && (
                <div className="pt-1.5 border-t border-border/60 space-y-1.5">
                  <Combobox
                    value={booking.partnerId ?? ''}
                    onChange={handleAssignPartner}
                    disabled={updateBooking.isPending}
                    placeholder="Select a transporter…"
                    options={(partners?.items ?? []).map((partner) => ({
                      value: partner.id,
                      label: partner.companyLegalName,
                      icon: <Avatar name={partner.companyLegalName} src={partner.logoUrl} size="xs" shape="circle" />,
                    }))}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] text-muted-foreground">
                      Driver and vehicle pickers switch to the new fleet.
                    </p>
                    <button
                      type="button"
                      className="shrink-0 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                      onClick={() => setIsEditingPartner(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </Card>

            {/* DRIVER CARD */}
            <Card className="p-3 rounded-lg border border-border/80 bg-card space-y-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="relative shrink-0">
                    <IconChip icon={User} size={36} />
                    {hasDriver && (
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-success rounded-full ring-2 ring-card" />
                    )}
                  </span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-bold text-foreground text-sm">{booking.driverName}</h4>
                      {booking.driverVerified && <VerificationBadge state="verified" size="sm" />}
                    </div>
                    <span className="text-xs text-muted-foreground">Assigned driver</span>
                  </div>
                </div>
                {!isEditingDriver && !isClosed && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    leadingIcon={<Pencil className="size-3" />}
                    onClick={() => setIsEditingDriver(true)}
                  >
                    Edit
                  </Button>
                )}
              </div>

              {hasDriver && !isEditingDriver && (
                <div className="pt-1.5 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                    {booking.driverPhone ?? 'No phone on file'}
                  </span>
                  {booking.driverVerified && (
                    <span className="flex items-center gap-1 text-success-subtle-foreground font-medium">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      License current
                    </span>
                  )}
                </div>
              )}

              {isEditingDriver && (
                <div className="pt-1.5 border-t border-border/60 space-y-1.5">
                  {booking.partnerId ? (
                    <>
                      <Combobox
                        value={booking.driverId ?? ''}
                        onChange={handleAssignDriver}
                        disabled={updateBooking.isPending}
                        options={[
                          { value: '', label: 'Unassigned' },
                          ...assignableDrivers.map((driver) => ({
                            value: driver.id,
                            label: isDriverVerified(driver)
                              ? `${driver.fullName} · ${driver.phone}`
                              : `${driver.fullName} · ${driver.phone} · License expired`,
                            icon: <Avatar name={driver.fullName} size="xs" shape="circle" />,
                          })),
                        ]}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] text-muted-foreground">
                          {booking.partnerName}'s own fleet.
                        </p>
                        <button
                          type="button"
                          className="shrink-0 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                          onClick={() => setIsEditingDriver(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Assign a transporter first to pick from their drivers.</p>
                  )}
                </div>
              )}
            </Card>

            {/* TRUCK / VEHICLE CARD */}
            <Card className="p-3 rounded-lg border border-border/80 bg-card space-y-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <IconChip icon={Truck} tint="neutral" size={36} />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-mono font-bold text-foreground text-sm tracking-wide">{booking.vehicleNumber}</h4>
                      {booking.vehicleVerified && <VerificationBadge state="verified" size="sm" />}
                    </div>
                    <span className="text-xs text-muted-foreground">{booking.vehicleType ?? 'No vehicle assigned'}</span>
                  </div>
                </div>
                {!isEditingVehicle && !isClosed && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    leadingIcon={<Pencil className="size-3" />}
                    onClick={() => setIsEditingVehicle(true)}
                  >
                    Edit
                  </Button>
                )}
              </div>

              {hasVehicle && !isEditingVehicle && (
                <div className="pt-1.5 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Vehicle Status</span>
                  <span className="font-semibold text-foreground">
                    {booking.vehicleVerified ? 'Documents current' : 'Documents need review'}
                  </span>
                </div>
              )}

              {isEditingVehicle && (
                <div className="pt-1.5 border-t border-border/60 space-y-1.5">
                  {booking.partnerId ? (
                    <>
                      <Combobox
                        value={booking.vehicleId ?? ''}
                        onChange={handleAssignVehicle}
                        disabled={updateBooking.isPending}
                        options={[
                          { value: '', label: 'Unassigned' },
                          ...assignableVehicles.map((vehicle) => ({
                            value: vehicle.id,
                            label: isVehicleVerified(vehicle)
                              ? `${vehicle.plateNumber} · ${vehicle.truckType}`
                              : `${vehicle.plateNumber} · ${vehicle.truckType} · Documents expired`,
                            icon: <Truck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />,
                          })),
                        ]}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] text-muted-foreground">
                          {booking.partnerName}'s own fleet.
                        </p>
                        <button
                          type="button"
                          className="shrink-0 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                          onClick={() => setIsEditingVehicle(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Assign a transporter first to pick from their fleet.</p>
                  )}
                </div>
              )}
            </Card>
          </div>

          {/* EMPTY RETURN — only meaningful once this booking is delivered.
              Its real `status` never advances past "Completed" for this;
              the container's actual trip back is tracked by Empty Return
              (a matched cycle, or a standalone flag) and only ever
              displayed here, never used to gate the status above. */}
          {booking.emptyReturnStage && (() => {
            // The cycle has no separate status to flip — it mirrors whichever
            // real booking is carrying the return load. `focusRecord` narrows
            // Empty Container Management's queue to this container and opens its
            // dialog, which is where the pairing, the margin and the activity
            // trail actually live; there is nothing to change from here.
            const openCycle = booking.emptyReturnCycleReference
              ? () => {
                  focusEmptyReturnRecord(
                    booking.emptyReturnCycleReference as string,
                    booking.emptyReturnCycleReference as string,
                  );
                  navigate(ROUTES.emptyReturns);
                }
              : undefined;

            const meta: Record<
              EmptyReturnStage,
              {
                icon: typeof Clock;
                tint: 'teal' | 'blue' | 'amber';
                label: string;
                description: string;
                action?: { label: string; onClick: () => void };
              }
            > = {
              awaiting_empty: {
                icon: Package,
                tint: 'blue',
                label: 'Not emptied yet',
                description:
                  'The return opens when the box is stripped — set the status to "Empty Ready" and record when that happened.',
              },
              waiting_match: {
                icon: Clock,
                tint: 'amber',
                label: 'Awaiting match',
                description: `${booking.containerNumber ?? 'This container'} has no full load matched yet.`,
                action: {
                  label: 'Find a full load',
                  /* Straight into the matching popup, focused on THIS booking —
                     the record id over there is the booking reference. If the
                     container is not in the pool yet, the popup opens on the
                     whole board instead. */
                  onClick: () =>
                    navigate(
                      `${ROUTES.emptyReturns}?match=${encodeURIComponent(booking.bookingNumber)}`,
                    ),
                },
              },
              matched: {
                icon: RotateCcw,
                tint: 'blue',
                label: 'In progress',
                description: 'Matched to a full load, heading back to the depot.',
                action: openCycle ? { label: 'Open the container', onClick: openCycle } : undefined,
              },
              returned: {
                icon: CheckCircle2,
                tint: 'teal',
                label: 'Returned',
                description: 'Confirmed back at the depot.',
                action: openCycle ? { label: 'View cycle', onClick: openCycle } : undefined,
              },
              standalone: {
                icon: AlertTriangle,
                tint: 'amber',
                label: 'Standalone Return',
                description: 'Returning on its own, outside matching. Confirm on arrival.',
                action: {
                  label: 'Confirm returned',
                  onClick: () => {
                    confirmStandaloneReturn.mutate(booking.id, {
                      onSuccess: (cycle) => {
                        onUpdateBooking({
                          ...booking,
                          emptyReturnStage: 'returned',
                          emptyReturnCycleReference: cycle.reference,
                        });
                      },
                    });
                  },
                },
              },
            };
            const info = meta[booking.emptyReturnStage];

            return (
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Empty Return</h3>
                <Card className="p-3 rounded-lg border border-border/80 bg-card space-y-2.5">
                  <div className="flex items-start gap-3">
                    <IconChip icon={info.icon} tint={info.tint} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-foreground">{info.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{info.description}</p>
                      {booking.emptyReadyAt && (
                        <p className="mt-1 text-[11px] font-semibold text-foreground">
                          Emptied {formatDate(booking.emptyReadyAt, 'dateTime')}
                        </p>
                      )}
                    </div>
                  </div>
                  {info.action && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      fullWidth
                      className="text-xs font-semibold"
                      trailingIcon={<ArrowRight className="w-3.5 h-3.5" />}
                      isLoading={booking.emptyReturnStage === 'standalone' && confirmStandaloneReturn.isPending}
                      onClick={info.action.onClick}
                    >
                      {info.action.label}
                    </Button>
                  )}
                </Card>
              </div>
            );
          })()}


          {/* Cancelling is off the ladder, so it sits off the end of the panel:
              it closes a job without delivering it, no rung brings it back, and
              it has no business being a thumb's width from the status field. */}
          {!isClosed && (
            <div className="border-t border-border/60 pt-4">
              <Button
                type="button"
                variant="ghost"
                className="h-9 w-full text-xs text-destructive hover:bg-destructive-subtle hover:text-destructive-subtle-foreground"
                disabled={updateBookingStatus.isPending}
                onClick={() => void handleCloseBooking('Cancelled')}
              >
                Cancel booking
              </Button>
            </div>
          )}


        </div>

        {/* ── WHEN DID THIS HAPPEN? ──
            Asked on every rung, not just the empty-ready one. The reports
            compute every duration from these timestamps, so the moment the
            operator reports is the only one worth storing — the moment they
            typed it tells you about the office, not the run. */}
        {pendingStatus?.bookingId === booking.id && (
          <div className="absolute inset-0 z-modal flex items-center justify-center bg-overlay/70 p-4 backdrop-blur-[2px]">
            <Card className="w-full max-w-xs space-y-3 rounded-lg border border-border bg-card p-4 shadow-lg">
              <div className="flex items-start gap-3">
                <IconChip
                  icon={
                    pendingStatus.target === 'Completed' && !booking.containerNumber
                      ? CheckCircle2
                      : pendingStatus.target.startsWith('Empty') ||
                          pendingStatus.target === 'Completed'
                        ? Package
                        : Clock
                  }
                  size={36}
                />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground">
                    When did &ldquo;{pendingStepLabel}&rdquo; happen?
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {pendingStatus.target === 'Empty Ready'
                      ? `${booking.containerNumber ?? 'This container'} enters the empty return from this moment, and detention is counted from it.`
                      : pendingStatus.target === 'Completed'
                        ? booking.containerNumber
                          ? `${booking.containerNumber} is back at the depot from this moment — it closes the empty return and the booking.`
                          : 'Bulk cargo is finished when it is delivered — there is no empty to bring back, so this closes the booking.'
                        : 'Recorded against the booking and used for every duration in its report.'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={occurredDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(event) => setOccurredDate(event.target.value)}
                  className="h-9 w-full cursor-pointer rounded-lg border border-border/80 bg-background px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <input
                  type="time"
                  value={occurredTime}
                  onChange={(event) => setOccurredTime(event.target.value)}
                  className="h-9 w-full cursor-pointer rounded-lg border border-border/80 bg-background px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => setPendingStatus(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={!occurredDate || !occurredTime || updateBookingStatus.isPending}
                  onClick={confirmStatusChange}
                >
                  {pendingStatus.target === 'Empty Ready'
                    ? 'Start empty return'
                    : pendingStatus.target === 'Completed'
                      ? booking.containerNumber
                        ? 'Confirm returned'
                        : 'Confirm delivered'
                      : 'Save'}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* ── FOOTER ── */}
        <div className="p-4 bg-card border-t border-border/80 shrink-0 flex items-center justify-end gap-3">
          <Button variant="outline" size="sm" onClick={onClose} className="rounded-lg h-9 text-xs px-4 border-border cursor-pointer">
            Close
          </Button>
        </div>

      <BookingDebriefDialog
        draft={debrief}
        bookingId={booking.id}
        driverName={booking.driverName}
        shipperCompany={shipperCompany}
        onChange={setDebrief}
        onClose={() => setDebrief(null)}
      />
      </SheetContent>
    </Sheet>
    </>
  );
}
