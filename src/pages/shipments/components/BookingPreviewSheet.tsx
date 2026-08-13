import { useState } from 'react';
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
} from '@/design-system/icons';
import { IconChip } from '@/design-system';
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

export interface BookingPreviewItem {
  id: string;
  bookingNumber: string;
  partnerName?: string;
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

const STATUS_OPTIONS: { label: string; intent: 'green' | 'orange' | 'blue' | 'slate' }[] = [
  { label: 'Dispatched', intent: 'slate' },
  { label: 'Port Entry', intent: 'blue' },
  { label: 'Free Zone Delivered', intent: 'orange' },
  { label: 'Pending Empty Return', intent: 'orange' },
  { label: 'Empty Returned', intent: 'green' },
  { label: 'Payment Released', intent: 'green' },
];

export function BookingPreviewSheet({
  open,
  booking,
  onClose,
  onUpdateBooking,
}: BookingPreviewSheetProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState('');
  const [statusSuccessMsg, setStatusSuccessMsg] = useState('');
  const [uploadedPod, setUploadedPod] = useState<{
    name: string;
    size: string;
    uploadedAt: string;
  } | null>(booking?.podDocument || null);

  if (!booking) return null;

  const currentPod = uploadedPod || booking.podDocument;

  const handleStatusChange = (newStatus: string, newIntent: 'green' | 'orange' | 'blue' | 'slate') => {
    const updated = {
      ...booking,
      status: newStatus,
      statusIntent: newIntent,
      podDocument: currentPod,
    };
    onUpdateBooking(updated);
    setStatusSuccessMsg(`Status updated to "${newStatus}"`);
    setTimeout(() => setStatusSuccessMsg(''), 3000);
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

      // Auto update booking with new POD and mark completed if desired
      const updated = {
        ...booking,
        podDocument: newPod,
        status: 'Trip completed',
        statusIntent: 'green' as const,
      };
      onUpdateBooking(updated);
      setUploadSuccessMsg('Proof of Delivery (POD) uploaded successfully!');
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
    switch (booking.statusIntent) {
      case 'green':
        return (
          <Badge variant="subtle" intent="success" size="md" className="gap-1 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {booking.status}
          </Badge>
        );
      case 'blue':
        return (
          <Badge variant="subtle" intent="info" size="md" className="gap-1 font-semibold">
            <Truck className="w-3.5 h-3.5" />
            {booking.status}
          </Badge>
        );
      case 'orange':
        return (
          <Badge variant="subtle" intent="warning" size="md" className="gap-1 font-semibold">
            <Clock className="w-3.5 h-3.5" />
            {booking.status}
          </Badge>
        );
      default:
        return (
          <Badge variant="subtle" intent="default" size="md" className="gap-1 font-semibold">
            {booking.status}
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

          {/* START & FINISH DATE / TIME PICKER */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-primary" />
              <span>Schedule & Dwell Timing</span>
            </h3>

            <Card className="p-3 rounded-lg border border-border/80 bg-card space-y-3 shadow-2xs">
              {/* START DATE & TIME */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-success" />
                  Start Date & Time
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <input
                      type="date"
                      value={booking.startDate || '2026-07-28'}
                      onChange={(e) =>
                        onUpdateBooking({
                          ...booking,
                          startDate: e.target.value,
                        })
                      }
                      className="w-full h-9 px-2.5 py-1 text-xs font-medium bg-background border border-border/80 rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                    />
                  </div>
                  <div className="relative">
                    <input
                      type="time"
                      value={booking.startTime || '08:00'}
                      onChange={(e) =>
                        onUpdateBooking({
                          ...booking,
                          startTime: e.target.value,
                        })
                      }
                      className="w-full h-9 px-2.5 py-1 text-xs font-medium bg-background border border-border/80 rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                    />
                  </div>
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
                  <div className="relative">
                    <input
                      type="date"
                      value={booking.finishDate || '2026-07-29'}
                      onChange={(e) =>
                        onUpdateBooking({
                          ...booking,
                          finishDate: e.target.value,
                        })
                      }
                      className="w-full h-9 px-2.5 py-1 text-xs font-medium bg-background border border-border/80 rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                    />
                  </div>
                  <div className="relative">
                    <input
                      type="time"
                      value={booking.finishTime || '17:00'}
                      onChange={(e) =>
                        onUpdateBooking({
                          ...booking,
                          finishTime: e.target.value,
                        })
                      }
                      className="w-full h-9 px-2.5 py-1 text-xs font-medium bg-background border border-border/80 rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* 2. PARTNER, DRIVER & TRUCK INFO CARDS */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Logistics Partner & Fleet Equipment</h3>

            {/* PARTNER CARD */}
            <Card className="p-3 rounded-lg border border-border/80 bg-card">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <IconChip icon={Building2} tint="amber" size={36} />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-bold text-foreground text-sm">{booking.partnerName || 'Fleetin Logistics Co.'}</h4>
                      <VerificationBadge state="verified" size="sm" className="bg-transparent border-0 text-success font-bold px-0 shrink-0" />
                    </div>
                    <span className="text-xs text-muted-foreground">Registered Logistics Partner</span>
                  </div>
                </div>
                <Badge variant="subtle" intent="info" size="sm" className="text-[10px]">Partner</Badge>
              </div>
            </Card>

            {/* DRIVER CARD */}
            <Card className="p-3 rounded-lg border border-border/80 bg-card space-y-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="relative shrink-0">
                    <IconChip icon={User} size={36} />
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-success rounded-full ring-2 ring-card" />
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
                <Badge variant="subtle" intent="success" size="sm" className="text-[10px]">Verified</Badge>
              </div>

              <div className="pt-1.5 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                  {booking.driverPhone || '+253 77 55 11 22'}
                </span>
                <span className="flex items-center gap-1 text-success-subtle-foreground font-medium">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Active Permit
                </span>
              </div>
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
                    <span className="text-xs text-muted-foreground">{booking.vehicleType || 'Heavy Cargo Trailer'}</span>
                  </div>
                </div>
                <Badge variant="subtle" intent="info" size="sm" className="text-[10px]">GPS Active</Badge>
              </div>

              <div className="pt-1.5 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                <span>Vehicle Status</span>
                <span className="font-semibold text-foreground">Operational & Insured</span>
              </div>
            </Card>
          </div>

          {/* 3. UPDATE STATUS SECTION */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Update Status</h3>
            <Card className="p-3 rounded-lg border border-border/80 bg-card">
              <div className="grid grid-cols-2 gap-2">
                {STATUS_OPTIONS.map((opt) => {
                  const isSelected = booking.status === opt.label;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => handleStatusChange(opt.label, opt.intent)}
                      className={`p-2.5 rounded-lg border text-xs font-semibold transition-all text-left flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
                          : 'border-border/80 bg-background hover:bg-secondary text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <span className="truncate">{opt.label}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
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
