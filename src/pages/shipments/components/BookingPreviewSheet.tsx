import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Truck,
  Phone,
  Upload,
  FileText,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Check,
  Trash2,
  Eye,
  Download,
  X,
  Building2,
  Calendar,
  ArrowRight,
  Pencil,
  RotateCcw,
  AlertTriangle,
  Package,
} from '@/design-system/icons';
import { Avatar, Combobox, IconChip } from '@/design-system';
import {
  Badge,
  Button,
  Card,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  VerificationBadge,
} from '@/design-system';
import { ROUTES } from '@/config/routes';
import { NEXT_BOOKING_STATUS, displayBookingStatus, statusIntentOf } from '@/features/bookings/api/bookingsService';
import { useUpdateBooking, useUpdateBookingStatus } from '@/features/bookings/api/queries';
import { useVehicles } from '@/features/vehicles/api/queries';
import { useDrivers } from '@/features/drivers/api/queries';
import { usePartners } from '@/features/partners/api/queries';
import { useEmptyReturnStore } from '@/stores/emptyReturn.store';
import { useConfirmStandaloneReturn } from '@/features/empty-returns/api/queries';

/**
 * Where this booking's own empty container sits, once delivered — a
 * booking's real `status` (the backend ladder, business rules, invoicing)
 * never advances past "Completed" for this; the container physically going
 * back is tracked by Empty Return separately (a matched cycle, or a
 * standalone flag) and only ever shown here, never used to gate anything.
 * Undefined before the booking is delivered — the question doesn't apply yet.
 */
export type EmptyReturnStage = 'waiting_match' | 'matched' | 'returned' | 'standalone';

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
  statusIntent: 'green' | 'orange' | 'blue' | 'slate';
  step?: string;
  startDate?: string;
  startTime?: string;
  finishDate?: string;
  finishTime?: string;
  emptyReturnStage?: EmptyReturnStage;
  /** The matched cycle's own reference (`CYC-2026-#####`) — set whenever `emptyReturnStage` is `matched` or `returned`, so the card can jump straight to it. */
  emptyReturnCycleReference?: string;
  podDocument?: {
    name: string;
    size: string;
    uploadedAt: string;
  } | null;
}

interface BookingPreviewSheetProps {
  open: boolean;
  booking: BookingPreviewItem | null;
  onClose: () => void;
  onUpdateBooking: (updatedBooking: BookingPreviewItem) => void;
}

export function BookingPreviewSheet({
  open,
  booking,
  onClose,
  onUpdateBooking,
}: BookingPreviewSheetProps) {
  const navigate = useNavigate();
  const focusEmptyReturnRecord = useEmptyReturnStore((state) => state.focusRecord);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState('');
  const [statusSuccessMsg, setStatusSuccessMsg] = useState('');
  const [uploadedPod, setUploadedPod] = useState<{
    name: string;
    size: string;
    uploadedAt: string;
  } | null>(booking?.podDocument || null);
  const [isEditingPartner, setIsEditingPartner] = useState(false);
  const [isEditingVehicle, setIsEditingVehicle] = useState(false);
  const [isEditingDriver, setIsEditingDriver] = useState(false);
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const updateBookingStatus = useUpdateBookingStatus();
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

  if (!booking) return null;

  const currentPod = uploadedPod || booking.podDocument;
  const nextStatus = NEXT_BOOKING_STATUS[booking.status];
  const hasDriver = Boolean(booking.driverId);
  const hasVehicle = Boolean(booking.vehicleId);

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
          onUpdateBooking({
            ...booking,
            partnerId: updated.partnerId ?? undefined,
            partnerName: updated.partner?.companyLegalName,
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
          });
          setIsEditingDriver(false);
        },
      },
    );
  };

  const handleAdvanceStatus = () => {
    if (!nextStatus) return;
    if (nextStatus === 'Driver Assigned' && !hasDriver) return;
    if (nextStatus === 'En Route' && !hasVehicle) return;
    if (nextStatus === 'Completed' && !hasVehicle) return;
    if (nextStatus === 'POD Submitted' && !currentPod) return;
    updateBookingStatus.mutate(
      { id: booking.id, status: nextStatus },
      {
        onSuccess: () => {
          onUpdateBooking({ ...booking, status: nextStatus, statusIntent: statusIntentOf(nextStatus) });
          setStatusSuccessMsg(`Status updated to "${nextStatus}"`);
          setTimeout(() => setStatusSuccessMsg(''), 3000);
        },
      },
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setTimeout(() => {
      const newPod = {
        name: file.name,
        size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setUploadedPod(newPod);
      setIsUploading(false);

      // The upload itself is local-only (no storage backend yet — see the
      // module note below) and does not change the real status on its own.
      // "Advance to POD Submitted" only unlocks once this exists; the actual
      // status write still goes through the real mutation, same as every
      // other step.
      onUpdateBooking({ ...booking, podDocument: newPod });
      setUploadSuccessMsg('Proof of Delivery (POD) attached — advance the status below to submit it.');
      setTimeout(() => setUploadSuccessMsg(''), 4000);
    }, 1000);
  };

  const handleRemovePod = () => {
    setUploadedPod(null);
    const updated = {
      ...booking,
      podDocument: null,
    };
    onUpdateBooking(updated);
  };

  const getStatusBadge = () => {
    const label = displayBookingStatus(booking.status);
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
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent side="right" hideCloseButton className="w-full sm:max-w-md md:max-w-lg p-0 flex flex-col h-full bg-background overflow-hidden border-l border-border shadow-2xl">
        <SheetTitle className="sr-only">Booking Preview #{booking.bookingNumber}</SheetTitle>
        <SheetDescription className="sr-only">
          Quick preview sidebar for booking details, partner, driver, vehicle, status updates, and proof of delivery upload.
        </SheetDescription>

        {/* ── HEADER ── */}
        <div className="p-4 bg-card border-b border-border/80 flex items-center justify-between shrink-0">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Booking Preview</span>
            <h2 className="text-xl font-extrabold tracking-tight text-foreground">
              Booking #{booking.bookingNumber}
            </h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Package className="w-3.5 h-3.5 shrink-0" />
              {booking.containerNumber ? (
                <span className="font-mono tracking-wide text-foreground">{booking.containerNumber}</span>
              ) : (
                <span className="italic">No container number on file</span>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg border border-border/80 bg-background hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── SCROLLABLE BODY CONTENT ── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* 1. STATUS BADGE DISPLAY */}
          <div className="bg-card p-3 rounded-lg border border-border/80 flex items-center justify-between shadow-2xs">
            <span className="text-xs text-muted-foreground font-medium">Current Status</span>
            {getStatusBadge()}
          </div>

          {/* Toast / Feedback Messages */}
          {statusSuccessMsg && (
            <div className="p-3 bg-success-subtle border border-success/30 text-success-subtle-foreground rounded-lg text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
              <Check className="w-4 h-4 shrink-0 text-success-subtle-foreground" />
              <span>{statusSuccessMsg}</span>
            </div>
          )}

          {uploadSuccessMsg && (
            <div className="p-3 bg-success-subtle border border-success/30 text-success-subtle-foreground rounded-lg text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-success-subtle-foreground" />
              <span>{uploadSuccessMsg}</span>
            </div>
          )}

          {/* START & FINISH DATE / TIME */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                <span>Schedule & Dwell Timing</span>
              </h3>
              {!isEditingSchedule && (
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
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Logistics Partner & Fleet Equipment</h3>

            {/* PARTNER CARD */}
            <Card className="p-3 rounded-lg border border-border/80 bg-card space-y-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <IconChip icon={Building2} tint="amber" size={36} />
                  <div>
                    <h4 className="font-bold text-foreground text-sm">{booking.partnerName ?? 'No transporter assigned'}</h4>
                    <span className="text-xs text-muted-foreground">Registered Logistics Partner</span>
                  </div>
                </div>
                {booking.partnerName && !isEditingPartner && (
                  <Badge variant="subtle" intent="info" size="sm" className="text-[10px]">Partner</Badge>
                )}
                {!isEditingPartner && (
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
                      Reassigning replaces this booking's transporter — its driver and vehicle pickers switch to the new fleet.
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
                      {booking.driverVerified && (
                        <VerificationBadge state="verified" size="sm" className="bg-transparent border-0 text-success font-bold px-0 shrink-0" />
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">Primary Fleet Driver</span>
                  </div>
                </div>
                {!isEditingDriver && (
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
                      {booking.vehicleVerified && (
                        <VerificationBadge state="verified" size="sm" className="bg-transparent border-0 text-success font-bold px-0 shrink-0" />
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{booking.vehicleType ?? 'No vehicle assigned'}</span>
                  </div>
                </div>
                {!isEditingVehicle && (
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
            // The cycle itself has no separate status field to flip — it mirrors
            // whatever real booking is carrying the return load. Jumping to the
            // cycle's own detail (Cycles & Chains) surfaces the actual "Advance
            // to X" action against that booking; there's nothing to change here.
            const openCycle = booking.emptyReturnCycleReference
              ? () => {
                  focusEmptyReturnRecord(booking.emptyReturnCycleReference as string, booking.emptyReturnCycleReference as string);
                  navigate(ROUTES.emptyReturnsCycles);
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
              waiting_match: {
                icon: Clock,
                tint: 'amber',
                label: 'Waiting for Empty Return Match',
                description: `Delivered — ${booking.containerNumber ?? 'this container'} hasn't been matched to a return load yet.`,
                action: { label: 'Find a Match', onClick: () => navigate(`${ROUTES.emptyReturns}?createMatch=1`) },
              },
              matched: {
                icon: RotateCcw,
                tint: 'blue',
                label: 'Empty Return In Progress',
                description: 'Matched to a return load — the container is on its way back to the hub.',
                action: openCycle ? { label: 'View Match Progress', onClick: openCycle } : undefined,
              },
              returned: {
                icon: CheckCircle2,
                tint: 'teal',
                label: 'Empty Returned',
                description: "Confirmed back at the hub — this container's empty return is complete.",
                action: openCycle ? { label: 'View Cycle', onClick: openCycle } : undefined,
              },
              standalone: {
                icon: AlertTriangle,
                tint: 'amber',
                label: 'Standalone Return',
                description: 'Flagged to return on its own, outside matching. Confirm it here once it physically lands at the hub.',
                action: {
                  label: 'Confirm Returned',
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

          {/* 3. UPDATE STATUS SECTION */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Update Status</h3>
            <Card className="p-3 rounded-lg border border-border/80 bg-card">
              {!nextStatus ? (
                <p className="py-1 text-center text-xs text-muted-foreground">
                  {displayBookingStatus(booking.status)} is a terminal status — nothing further to advance.
                </p>
              ) : nextStatus === 'Driver Assigned' && !hasDriver ? (
                <p className="py-1 text-center text-xs text-muted-foreground">
                  Assign a driver above — a booking can't move to Driver Assigned without one.
                </p>
              ) : nextStatus === 'En Route' && !hasVehicle ? (
                <p className="py-1 text-center text-xs text-muted-foreground">
                  Assign a vehicle above — a booking can't be En Route without one.
                </p>
              ) : nextStatus === 'POD Submitted' && !currentPod ? (
                <p className="py-1 text-center text-xs text-muted-foreground">
                  Attach a Proof of Delivery below to submit it.
                </p>
              ) : nextStatus === 'Completed' && !hasVehicle ? (
                <p className="py-1 text-center text-xs text-muted-foreground">
                  Assign a vehicle above — a booking can't be completed without one.
                </p>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  fullWidth
                  className="text-xs font-semibold"
                  isLoading={updateBookingStatus.isPending}
                  leadingIcon={<ArrowRight className="w-3.5 h-3.5" />}
                  onClick={handleAdvanceStatus}
                >
                  Mark as {nextStatus}
                </Button>
              )}
            </Card>
          </div>

          {/* 4. PROOF OF DELIVERY (POD) UPLOAD SECTION */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Proof of Delivery (POD)</h3>
              {currentPod && (
                <span className="text-[11px] font-semibold text-success-subtle-foreground flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  POD Uploaded
                </span>
              )}
            </div>

            {currentPod ? (
              /* UPLOADED POD FILE CARD */
              <Card className="p-3 rounded-lg border border-success/30 bg-success-subtle space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <IconChip icon={FileText} size={36} />
                    <div className="min-w-0">
                      <h4 className="font-semibold text-foreground text-xs truncate" title={currentPod.name}>
                        {currentPod.name}
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        {currentPod.size} • Uploaded at {currentPod.uploadedAt}
                      </p>
                    </div>
                  </div>
                  <Badge variant="subtle" intent="success" size="sm" className="shrink-0 text-[10px]">
                    Verified
                  </Badge>
                </div>

                <div className="pt-2 border-t border-success/20 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => alert(`Opening preview for ${currentPod.name}`)}
                      className="h-8 text-xs rounded-lg gap-1.5 border-success/30 text-success-subtle-foreground hover:bg-success-subtle cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => alert(`Downloading ${currentPod.name}`)}
                      className="h-8 text-xs rounded-lg gap-1.5 border-success/30 text-success-subtle-foreground hover:bg-success-subtle cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </Button>
                  </div>

                  <button
                    type="button"
                    onClick={handleRemovePod}
                    className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                    title="Remove POD Document"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </Card>
            ) : (
              /* POD UPLOAD DROPZONE */
              <Card className="p-4 rounded-lg border-2 border-dashed border-border hover:border-primary/60 bg-card transition-colors text-center relative overflow-hidden group">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer z-10"
                />

                {isUploading ? (
                  <div className="py-2 space-y-2 flex flex-col items-center justify-center">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs font-semibold text-primary">Uploading Proof of Delivery...</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-3 text-left">
                    <IconChip icon={Upload} size={36} className="group-hover:scale-105 transition-transform shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-foreground">
                        Click or drag file to upload POD
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Supports PDF, PNG, JPG up to 10MB
                      </p>
                    </div>
                    <Button variant="outline" size="sm" className="rounded-lg text-xs h-8 px-4 border-border pointer-events-none shrink-0">
                      Browse
                    </Button>
                  </div>
                )}
              </Card>
            )}
          </div>

        </div>

        {/* ── FOOTER ── */}
        <div className="p-4 bg-card border-t border-border/80 shrink-0 flex items-center justify-end gap-3">
          <Button variant="outline" size="sm" onClick={onClose} className="rounded-lg h-9 text-xs px-4 border-border cursor-pointer">
            Close Preview
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
