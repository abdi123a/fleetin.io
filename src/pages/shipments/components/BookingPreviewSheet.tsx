import type { StatusIntent } from '@/design-system/primitives/Layout/statusIntent';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Truck,
  ArrowLeftRight,
  CheckCircle2,
  Clock,
  Check,
  Building2,
  Calendar,
  ArrowRight,
  Pencil,
  Phone,
  RotateCcw,
  ShieldCheck,
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
import {
  Co2Figure,
  FleetinImpactBlock,
  useBookingRoute,
  useRebuildBookingRoute,
  type RouteLeg,
} from '@/features/emissions';
import { usePermissions } from '@/hooks/usePermissions';
import { co2Number, formatFactor } from '@/lib/co2';
import { BookingProofPanel } from '@/features/documents/components/BookingProofPanel';
import { ProofFileField } from '@/features/documents/components/ProofFileField';
import { proofsRequiredForWalk, type ProofRequirement } from '@/features/documents/proofRequirement';
import { uploadDocuments } from '@/features/documents/api/documentsService';
import { useDocuments } from '@/features/documents/api/queries';
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
/* Declared with the rule that computes it, not beside the component that draws
   it — see `features/empty-returns/returnStage`. Imported AND re-exported: this
   file uses the name itself, and `export type { X } from` alone re-exports
   without binding it locally. */
import type { EmptyReturnStage } from '@/features/empty-returns/returnStage';
export type { EmptyReturnStage };

export interface BookingPreviewItem {
  id: string;
  bookingNumber: string;
  /** The reference exactly as stored — what Empty Return keys its records on. */
  bookingReference?: string;
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
  /**
   * How the empty went home: welded to a next full load, or on its own.
   *
   * Read off the cycle's `nextBookingId` — a cycle with one is a match, the
   * win the whole Empty Container module exists to find; a cycle without one
   * is a lone return that burned a leg. Only meaningful once the box is back,
   * which is the only place it is drawn.
   */
  emptyReturnMatched?: boolean;
  /**
   * The empty return's own crew, when it is not the crew that delivered.
   *
   * Recorded on the `Empty Picked Up` rung and carried here so the card can
   * name it and the closing debrief can ask about the right person. Undefined
   * means the delivery crew took the box back.
   */
  returnDriverId?: string;
  returnVehicleId?: string;
  returnDriverName?: string;
  returnVehicleNumber?: string;
  /** When the box was emptied — recorded on the "Empty Ready" rung, and what the return counts from. */
  emptyReadyAt?: string;
  /** The matched cycle's own reference (`CYC-2026-#####`) — set whenever `emptyReturnStage` is `matched` or `returned`, so the card can jump straight to it. */
  emptyReturnCycleReference?: string;
  /**
   * What this container's run put into the air, and over how far.
   *
   * Read straight off the booking — the figure was computed once, server-side,
   * from the factor its truck carried at the time. `co2DistanceSource` says
   * whether the kilometres are a measured route or the shipment's quoted hop,
   * which is the difference between a measurement and an estimate.
   */
  co2EmissionsKg?: string | number | null;
  actualDistanceKm?: string | number | null;
  co2FactorUsed?: string | number | null;
  co2DistanceSource?: string | null;
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
  /** The shipment this booking belongs to — carried into Matching as the way back. */
  shipmentRef?: string;
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
  shipmentRef,
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

  /**
   * The evidence the chosen rung owes, asked for beside the moment.
   *
   * The same rule as the card-side picker (`BookingStatusPicker`), because it
   * is the same act: the two controls write the same rungs to the same
   * backend, and the backend refuses `Arrived` without a delivery note and
   * `Completed` without a depot receipt. Without the field here, choosing
   * "Delivered" from this sheet produced a refusal with nothing on screen able
   * to satisfy it.
   */
  const [proofFiles, setProofFiles] = useState<Record<string, File[]>>({});
  const [uploadingProof, setUploadingProof] = useState(false);
  /* `booking` is null while the sheet is closed; the hook is disabled without
     an id, so this is a no-op read rather than a conditional hook. */
  const { data: bookingDocuments = [] } = useDocuments('BOOKING', booking?.id);
  const [isEditingPartner, setIsEditingPartner] = useState(false);
  const [isEditingVehicle, setIsEditingVehicle] = useState(false);
  const [isEditingDriver, setIsEditingDriver] = useState(false);
  /* One state for the pair: a return driver and the truck they came in are one
     answer, and two separate editors implied they could be recorded apart. */
  const [isEditingReturnCrew, setIsEditingReturnCrew] = useState(false);
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
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
  /* The measured route behind this booking's carbon figure, and the way to
     re-measure it. Keyed on the open booking, so the sheet — which stays
     mounted for the life of the page — fetches nothing until one is picked. */
  const { data: route } = useBookingRoute(booking?.id);
  const rebuildRoute = useRebuildBookingRoute();
  /* Saying what a truck physically did is the Empty Container module's
     write, so its permission gates the verdict buttons — not the sheet's. */
  const { can } = usePermissions();
  const canDecideImpact = can('empty-returns.update');
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

  /**
   * The delivery crew is settled once the load has arrived.
   *
   * Not at `Completed` — by then the box has also been fetched, and leaving the
   * pair editable through the whole empty-return leg is what let somebody
   * record the RETURN driver by overwriting the one who delivered. From
   * `Arrived` on, who brought the load is a fact about something that already
   * happened; correcting a genuine mistake is a job for whoever can edit the
   * booking's history, not a pencil sitting beside it for days.
   *
   * The empty-return row below stays editable on purpose — it is the one thing
   * here that is normally learned at or after the closing rung.
   */
  const deliveryLocked =
    isClosed || BOOKING_LADDER.indexOf(booking.status) >= BOOKING_LADDER.indexOf('Arrived');

  // A real fleet has expired paperwork in it more often than not — hiding
  // those trucks/drivers made the whole picker read as "empty" for any
  // partner whose one driver or vehicle happened to lapse. Same advisory
  // stance as the payout window: offer everyone, flag what's expired, let
  // the dispatcher decide. The post-assignment badges (`vehicleVerified`,
  // `driverVerified`) already show "Documents need review" for these.
  const isVehicleVerified = (vehicle: { registrationExpiry: string; insuranceExpiry: string }) =>
    new Date(vehicle.registrationExpiry).getTime() > Date.now() &&
    new Date(vehicle.insuranceExpiry).getTime() > Date.now();
  /* One rule, in `@/utils` — a driver is verified by holding a licence number,
     not by a date. See `isDriverVerified`. */
  const isDriverVerified = (driver: { drivingLicenseNumber?: string | null }) =>
    Boolean(driver.drivingLicenseNumber?.trim());

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
              ? isDriverVerified(updated.driver)
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

  /**
   * The empty return's crew, set here and only here.
   *
   * Neither picker closes the editor. The rows above are one field each, so
   * choosing shuts them; this one is a driver AND a truck, and closing on the
   * first pick sent you back to the pencil to name the vehicle. Both save on
   * selection — "Done" only puts the editor away.
   *
   * It was briefly asked inside the status dialog on `Delivered` — one more
   * question on a rung that already asks two, and answered days before anybody
   * knows who is actually coming. It belongs on the record instead: the sheet
   * shows both crews side by side, and whoever learns who is fetching the box
   * writes it down when they learn it.
   *
   * `null` clears the pair back to "the delivery crew took it back", which is
   * what an empty selection means and what every row said before this existed.
   */
  const handleAssignReturnDriver = (driverId: string) => {
    updateBooking.mutate(
      { id: booking.id, payload: { returnDriverId: driverId || null } },
      {
        onSuccess: (updated) => {
          onUpdateBooking({
            ...booking,
            returnDriverId: updated.returnDriverId ?? undefined,
            returnDriverName: updated.returnDriver?.fullName,
          });
        },
      },
    );
  };

  const handleAssignReturnVehicle = (vehicleId: string) => {
    updateBooking.mutate(
      { id: booking.id, payload: { returnVehicleId: vehicleId || null } },
      {
        onSuccess: (updated) => {
          onUpdateBooking({
            ...booking,
            returnVehicleId: updated.returnVehicleId ?? undefined,
            returnVehicleNumber: updated.returnVehicle?.plateNumber,
          });
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
            driverVerified: updated.driver ? isDriverVerified(updated.driver) : false,
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
      /* No debrief from here — the page asks, off the row itself, so the
         question survives a booking closed from anywhere else. */
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
    setProofFiles({});
    setPendingStatus({ bookingId: booking.id, target });
  };

  /* Over the whole walk, and minus whatever is already filed — one click can
     pass through both gated rungs, and a booking being re-recorded must not be
     asked for its delivery note twice. */
  const outstandingProofs: ProofRequirement[] = pendingStatus
    ? proofsRequiredForWalk(ladderPathTo(pendingStatus.target), Boolean(booking.containerNumber)).filter(
        (proof) => !bookingDocuments.some((document) => document.category === proof.category),
      )
    : [];

  const confirmStatusChange = async () => {
    if (!pendingStatus || !occurredDate || !occurredTime) return;
    const target = pendingStatus.target;
    const occurredAt = new Date(`${occurredDate}T${occurredTime}`);
    if (Number.isNaN(occurredAt.getTime())) return;
    // Nothing has happened in the future — every duration off it would be negative.
    if (occurredAt.getTime() > Date.now()) {
      setStatusErrorMsg('That moment has not happened yet — pick a date and time in the past.');
      return;
    }

    const unproven = outstandingProofs.find((proof) => (proofFiles[proof.category] ?? []).length === 0);
    if (unproven) {
      setStatusErrorMsg(unproven.missing);
      return;
    }

    /* Files first: the rung is refused until the document exists. */
    if (outstandingProofs.length > 0) {
      setUploadingProof(true);
      try {
        for (const proof of outstandingProofs) {
          await uploadDocuments({
            ownerType: 'BOOKING',
            ownerId: booking.id,
            category: proof.category,
            files: proofFiles[proof.category] ?? [],
          });
        }
      } catch (error) {
        setStatusErrorMsg(error instanceof Error ? error.message : 'The document could not be filed.');
        setUploadingProof(false);
        return;
      }
      setUploadingProof(false);
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
        {/*
         * `flex flex-col` rather than a plain block, purely so one section can
         * be lifted by `order` — see the Empty Return card near the bottom.
         * `gap-4` replaces `space-y-4`, which does not survive reordering: it
         * puts the margin on "every child but the first" in DOM order, so a
         * reordered first child keeps a margin it should not have.
         */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">

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

          {/* ── THE EVIDENCE ──
              The delivery note and the depot receipt, where the booking is
              read. They are captured in the dialog that records the moment —
              the only point at which somebody is holding the paper — but a
              proof that cannot be opened afterwards is a filing exercise, and
              this sheet is where one booking gets examined. */}
          <BookingProofPanel
            bookingId={booking.id}
            hasContainer={Boolean(booking.containerNumber)}
            status={booking.status}
          />

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
          {/* Not while the dialog is up: it prints the same sentence over the
              control that can act on it, and the banner behind the overlay was
              the sheet saying it a second time. */}
          {statusErrorMsg && !pendingStatus && (
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

          {/* 2. PARTNER, DRIVER & TRUCK INFO CARDS
           *
           * One frame, four rows. They were four detached cards with identical
           * borders and a gap between each — four separate objects, when they
           * are four lines of one answer: who carried this booking. Grouping
           * them says that without touching a single row's own layout.
           *
           * The delivery crew is a record of what happened, not a setting: once
           * the container is off the truck, "Edit" here would rewrite history
           * rather than plan anything. So from `Arrived` onward these three
           * cards drop their buttons and their footer lines and just state the
           * fact — and the empty-return card below, which is the only thing
           * still undecided at that point, is the one that stays editable. */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Transporter & Fleet</h3>

            <Card className="divide-y divide-border overflow-hidden rounded-lg border border-border/80 bg-card p-0">

            {/* PARTNER CARD */}
            <div className="p-3 space-y-2">
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
                {!isEditingPartner && !deliveryLocked && (
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
            </div>

            {/* THE CREW, ONE ROW ONCE THE TRIP IS OVER
             *
             * Before delivery these are two cards because they are two
             * decisions — who drives, what they drive — each with its own
             * picker. After it they are one fact, and two full cards to say
             * "Ali drove it in MS-1126-DJ" cost more of a closed booking's
             * sheet than the return leg that is still live below them. So the
             * locked pair collapses into the same shape as the return row: the
             * person on the line, the plate on the footer. */}
            {deliveryLocked ? (
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="relative shrink-0">
                    <IconChip icon={User} size={36} />
                    {hasDriver && (
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-success rounded-full ring-2 ring-card" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="truncate font-bold text-foreground text-sm">{booking.driverName}</h4>
                      {booking.driverVerified && <VerificationBadge state="verified" size="sm" />}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {['Drove the delivery', booking.driverPhone].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                </div>

                <div className="pt-1.5 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Vehicle Plate Number</span>
                  <span className="font-mono font-semibold tracking-wide text-foreground">
                    {booking.vehicleNumber}
                  </span>
                </div>
              </div>
            ) : (
              <>
              {/* DRIVER CARD */}
              <div className="p-3 space-y-2">
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
                      <span className="text-xs text-muted-foreground">
                        {deliveryLocked ? 'Drove the delivery' : 'Assigned driver'}
                        {deliveryLocked && booking.driverPhone ? ` · ${booking.driverPhone}` : ''}
                      </span>
                    </div>
                  </div>
                  {!isEditingDriver && !deliveryLocked && (
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

                {hasDriver && !isEditingDriver && !deliveryLocked && (
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
              </div>

              {/* TRUCK / VEHICLE CARD */}
              <div className="p-3 space-y-2">
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
                  {!isEditingVehicle && !deliveryLocked && (
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

                {hasVehicle && !isEditingVehicle && !deliveryLocked && (
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
              </div>
              </>
            )}

            {/* EMPTY RETURN CREW CARD
             *
             * The one card here that outlives the delivery. The transporter
             * often sends a different truck back for the box, and nobody knows
             * which until it happens — so this is picked the same way as the
             * two above, stays open after the others lock, and is what decides
             * whether the closing debrief asks about one driver or two.
             *
             * Its window is `Arrived` to the depot gate. Once the box is home
             * this row is history like the rest of them — and rewriting who
             * fetched it after the debrief has already asked that person how it
             * went would move the answer onto somebody else's name.
             *
             * It appears at `Arrived` and not before. Until the load is off the
             * truck there is no return leg to crew, and the card had nothing of
             * its own to show — it echoed the delivery driver and plate back as
             * "same crew as delivery", which read as a decision already taken
             * about a trip nobody had thought about yet. */}
            {booking.containerNumber && deliveryLocked && (
              <div className="p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <IconChip icon={RotateCcw} size={36} />
                    <div>
                      <h4 className="font-bold text-foreground text-sm">
                        {booking.returnDriverName ?? booking.driverName ?? 'Not recorded'}
                      </h4>
                      <span className="text-xs text-muted-foreground">
                        {booking.returnDriverName ? 'Took the empty back' : 'Same crew as delivery'}
                      </span>
                    </div>
                  </div>
                  {!isEditingReturnCrew && !isClosed && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      leadingIcon={<Pencil className="size-3" />}
                      onClick={() => setIsEditingReturnCrew(true)}
                    >
                      Edit
                    </Button>
                  )}
                </div>

                {(!isEditingReturnCrew || isClosed) && (
                  <div className="pt-1.5 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Vehicle Plate Number</span>
                    <span className="font-mono font-semibold tracking-wide text-foreground">
                      {booking.returnVehicleNumber ?? booking.vehicleNumber ?? 'Not recorded'}
                    </span>
                  </div>
                )}

                {isEditingReturnCrew && !isClosed && (
                  <div className="pt-1.5 border-t border-border/60 space-y-1.5">
                    {booking.partnerId ? (
                      <>
                        <Combobox
                          value={booking.returnDriverId ?? ''}
                          onChange={handleAssignReturnDriver}
                          disabled={updateBooking.isPending}
                          options={[
                            { value: '', label: 'Same as delivery' },
                            ...assignableDrivers.map((driver) => ({
                              value: driver.id,
                              label:
                                driver.id === booking.driverId
                                  ? `${driver.fullName} · delivered this`
                                  : `${driver.fullName} · ${driver.phone}`,
                              icon: <Avatar name={driver.fullName} size="xs" shape="circle" />,
                            })),
                          ]}
                        />
                        <Combobox
                          value={booking.returnVehicleId ?? ''}
                          onChange={handleAssignReturnVehicle}
                          disabled={updateBooking.isPending}
                          options={[
                            { value: '', label: 'Same as delivery' },
                            ...assignableVehicles.map((vehicle) => ({
                              value: vehicle.id,
                              label:
                                vehicle.id === booking.vehicleId
                                  ? `${vehicle.plateNumber} · delivered this`
                                  : `${vehicle.plateNumber} · ${vehicle.truckType}`,
                              icon: <Truck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />,
                            })),
                          ]}
                        />
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] text-muted-foreground">
                            Leave as delivery if the same crew went back for it.
                          </p>
                          <button
                            type="button"
                            className="shrink-0 text-[10px] font-semibold text-primary hover:underline"
                            onClick={() => setIsEditingReturnCrew(false)}
                          >
                            Done
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">Assign a transporter first to pick from their fleet.</p>
                    )}
                  </div>
                )}
              </div>
            )}
            </Card>
          </div>

          {/* ── EMISSIONS ──
           *
           * The figure, and the drive that produced it.
           *
           * The legs are the point of putting this here rather than only on
           * the dashboard: a reader who sees 47.9 km against an 85 km lane
           * needs to be able to look at what was counted. The factor beneath
           * is the truck's, as it stood when this booking was assigned — the
           * snapshot, not the truck's present rating, which is why it can
           * differ from what the Vehicles page shows today.
           *
           * The rebuild button is a write and looks like one. Re-measuring a
           * lane costs a Routes API element, so it is asked for rather than
           * done on every open. */}
          {booking.co2EmissionsKg != null && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Emissions</h3>

              <Co2Figure
                size="md"
                co2Kg={booking.co2EmissionsKg}
                distanceKm={booking.actualDistanceKm}
                source={booking.co2DistanceSource}
              />

              <Card className="space-y-2.5 rounded-lg border border-border/80 bg-card p-3">
                {route?.legs.length ? (
                  <ol className="space-y-1.5">
                    {route.legs.map((leg: RouteLeg) => (
                      <li key={leg.id} className="flex items-center gap-2 text-[11px]">
                        <span className="min-w-0 flex-1 truncate text-foreground">
                          <span className="font-semibold">{leg.originName}</span>
                          <span className="mx-1 text-muted-foreground">→</span>
                          <span className="font-semibold">{leg.destinationName}</span>
                        </span>
                        {/* A straight line is not a road, and says so. A
                            measured leg carries no badge — labelling every
                            row "measured" tells the reader nothing. */}
                        {leg.provider === 'haversine' && (
                          <Badge variant="subtle" intent="default" size="sm" className="shrink-0 text-[10px]">
                            Straight line
                          </Badge>
                        )}
                        <span className="shrink-0 font-bold tabular-nums text-foreground">
                          {(leg.distanceMeters / 1000).toFixed(1)} km
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    No route measured yet — the distance above is this shipment's own
                    pickup-to-delivery estimate.
                  </p>
                )}

                <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2">
                  <span className="text-[11px] text-muted-foreground">
                    Factor used{' '}
                    <strong className="font-semibold text-foreground">
                      {formatFactor(co2Number(booking.co2FactorUsed))}
                    </strong>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    disabled={rebuildRoute.isPending}
                    leadingIcon={<RotateCcw className="size-3" />}
                    onClick={() => rebuildRoute.mutate(booking.id)}
                  >
                    {rebuildRoute.isPending ? 'Measuring…' : 'Re-measure'}
                  </Button>
                </div>

                {rebuildRoute.data?.notes?.map((note: string) => (
                  <p key={note} className="text-[11px] font-medium text-warning-subtle-foreground">
                    {note}
                  </p>
                ))}
              </Card>
            </div>
          )}

          {/* ── FLEETIN IMPACT ──
           *
           * The other account, under its own heading and never inside the
           * emissions block above: what a realized match stopped this truck
           * driving. Drawn only for a booking that is one end of a pairing —
           * the empty that left under a next load, or the load that continued
           * from a free zone — so most sheets never show it at all. */}
          {route?.impacts && route.impacts.length > 0 && (
            <FleetinImpactBlock impacts={route.impacts} canDecide={canDecideImpact} />
          )}

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
                label: 'Still loaded',
                description:
                  'The return opens when the box is stripped — set the status to "Empty Ready" and record when that happened.',
              },
              waiting_match: {
                icon: Clock,
                tint: 'amber',
                label: 'No return booked',
                description: `${booking.containerNumber ?? 'This container'} has no full load matched yet.`,
                action: {
                  label: 'Find a full load',
                  /* Straight into the matching popup, focused on THIS booking —
                     the record id over there is the booking reference. If the
                     container is not in the pool yet, the popup opens on the
                     whole board instead. */
                  /* `from=` is the trail home. Matching is a full page, so
                     confirming a pairing used to leave the operator on the
                     Empty Container board with no way back to the shipment
                     they came from — they had opened this sheet to solve one
                     container's problem, not to start browsing the backlog. */
                  onClick: () =>
                    navigate(
                      `${ROUTES.emptyReturns}?match=${encodeURIComponent(booking.bookingNumber)}`
                      + (shipmentRef ? `&from=${encodeURIComponent(shipmentRef)}` : ''),
                    ),
                },
              },
              matched: {
                /* The pairing mark, the same one the Empty Container module
                   puts on its PAIRED connector and its Matching button — this
                   used to be `RotateCcw`, which is the *return* glyph and is
                   what `standalone` deserves rather than this. A confirmed
                   pairing should be recognisable as a pairing wherever it is
                   drawn. */
                icon: ArrowLeftRight,
                tint: 'blue',
                /* Was "In progress", which said nothing — everything on this
                   sheet is in progress. The fact worth printing is that the box
                   has a ride home: paired with an inbound full load and
                   travelling to the depot. */
                label: 'Heading back',
                description: 'Paired with a full load and on its way to the depot.',
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
                label: 'Returning alone',
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

            /*
             * From the moment the box is stripped until it is logged back at
             * the depot, the return IS the job — nobody opens this sheet on an
             * "Empty Ready" booking to re-read the schedule. So it leads while
             * it is live, and once the container is home it drops back to
             * where it belongs, below the fleet: a record of what happened
             * rather than a thing to act on.
             *
             * `-order-1` rather than moving the JSX, so the block keeps its one
             * definition and the reading order of the file still matches the
             * lifecycle it describes.
             */
            const leads =
              booking.emptyReturnStage === 'waiting_match'
              || booking.emptyReturnStage === 'matched'
              || booking.emptyReturnStage === 'standalone';

            return (
              <div className={cn('space-y-2', leads && '-order-1')}>
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
            <Card className="max-h-full w-full max-w-xs space-y-3 overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-lg">
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

              {/* ── AND WHAT PROVES IT? ──
                  The delivery note at one end of the job, the depot receipt at
                  the other. Asked here rather than on a screen nobody
                  revisits: the operator recording the moment is the one
                  holding the paper. */}
              {outstandingProofs.map((proof) => (
                <div key={proof.category} className="space-y-1.5 border-t border-border/60 pt-3">
                  <div>
                    <p className="text-xs font-bold leading-tight text-foreground">{proof.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{proof.hint}</p>
                  </div>
                  <ProofFileField
                    files={proofFiles[proof.category] ?? []}
                    disabled={uploadingProof || updateBookingStatus.isPending}
                    onChange={(files) => {
                      setProofFiles((held) => ({ ...held, [proof.category]: files }));
                      setStatusErrorMsg('');
                    }}
                  />
                </div>
              ))}

              {statusErrorMsg && (
                <p className="text-[11px] font-medium text-destructive">{statusErrorMsg}</p>
              )}

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={uploadingProof}
                  onClick={() => setPendingStatus(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={!occurredDate || !occurredTime || updateBookingStatus.isPending || uploadingProof}
                  onClick={() => void confirmStatusChange()}
                >
                  {uploadingProof
                    ? 'Filing…'
                    : pendingStatus.target === 'Empty Ready'
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

      </SheetContent>
    </Sheet>
    </>
  );
}
