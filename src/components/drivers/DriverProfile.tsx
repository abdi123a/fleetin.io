import type { ReactNode } from 'react';
import { Building2 } from 'lucide-react';
import { ContainerIcon, ExternalLink, Phone, Star, User } from '@/design-system/icons';
import {
  Button,
  Card,
  IconChip,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/design-system';
import { ExpiryLabel } from '@/components/common';
import { PerformancePanel } from '@/components/performance';
import { PanelHeader } from '@/components/panels';
import type { PerformanceSummary } from '@/lib/rating';
import type { OperationalStatus, PartnerDriver } from '@/types/partner';
import { cn, isDriverVerified } from '@/utils';

/**
 * One driver's read-only profile — the same body wherever it is opened.
 *
 * It is opened from two places that used to be one: the Drivers page, where it
 * is a tab in a drawer that can also edit, and a transporter's dossier, where
 * clicking a roster row used to *navigate to the Drivers page*. Being thrown
 * out of the dossier to read one of its own drivers is the wrong answer, so
 * the dossier now opens this sheet in place — and the two screens share this
 * markup rather than growing a second, drifting copy of it.
 */

export function DriverStatusPill({ status }: { status: OperationalStatus }) {
  const tone = {
    Available: 'bg-success-subtle text-success-subtle-foreground border-success/20 [&>i]:bg-success',
    'In Transit': 'bg-info-subtle text-info-subtle-foreground border-info/20 [&>i]:bg-info',
    'Under Maintenance': 'bg-warning-subtle text-warning-subtle-foreground border-warning/20 [&>i]:bg-warning',
    'Out of Service':
      'bg-destructive-subtle text-destructive-subtle-foreground border-destructive/20 [&>i]:bg-destructive',
  }[status];
  const label = status === 'Under Maintenance' ? 'Maintenance' : status;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
        tone,
      )}
    >
      <i className="h-1.5 w-1.5 shrink-0 rounded-full" />
      {label}
    </span>
  );
}

/**
 * Kept as a name, not as a component: `@/components/drivers` has exported this
 * since the driver panel was built, and a licence expiry is the same fact as a
 * truck's insurance expiry — one grading, in `ExpiryLabel`.
 */
export const DriverExpiryLabel = ExpiryLabel;

export interface DriverProfileHeaderProps {
  driver: PartnerDriver;
  /** Turns on the shared Edit control. Omitted where the panel is read-only. */
  onEdit?: () => void;
  editing?: boolean;
  /** Draw the sheet's close beside Edit — see `PanelHeader`. */
  withClose?: boolean;
  className?: string;
}

export function DriverProfileHeader({
  driver,
  onEdit,
  editing,
  withClose,
  className,
}: DriverProfileHeaderProps) {
  return (
    <PanelHeader
      className={className}
      withClose={withClose}
      media={
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/80 bg-muted">
          {driver.profilePictureUrl ? (
            <img src={driver.profilePictureUrl} alt="" className="size-full object-cover" />
          ) : (
            <User className="size-8 text-muted-foreground" />
          )}
        </div>
      }
      title={driver.fullName}
      subtitle={<span className="font-mono">{driver.reference}</span>}
      verified={isDriverVerified(driver)}
      status={<DriverStatusPill status={driver.status} />}
      onEdit={onEdit}
      editing={editing}
    />
  );
}

export interface DriverProfileOverviewProps {
  driver: PartnerDriver;
  summary: PerformanceSummary;
  /** Omitted when the profile is already being read inside that transporter's dossier. */
  transporter?: { name: string; country?: string; reference?: string; onOpen?: () => void };
  /** Rendered at the bottom — the Drivers page puts its "Edit driver & documents" button here. */
  footer?: ReactNode;
  className?: string;
}

export function DriverProfileOverview({
  driver,
  summary,
  transporter,
  footer,
  className,
}: DriverProfileOverviewProps) {
  return (
    <div className={cn('space-y-5', className)}>
      {/* Performance first — it is what the profile is opened for. */}
      <Card className="space-y-4 rounded-lg border border-border/80 bg-card p-4">
        <div className="flex items-center gap-2 border-b border-border/60 pb-3">
          <Star className="size-4 shrink-0 text-warning fill-warning" />
          <h4 className="text-sm font-semibold text-foreground">Performance</h4>
        </div>
        <PerformancePanel summary={summary} />
      </Card>

      {transporter && (
        <Card className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Transporter
          </span>
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Building2 className="size-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-foreground">{transporter.name}</p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {[transporter.country, transporter.reference].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
            {transporter.onOpen && (
              <Button
                size="sm"
                variant="outline"
                shape="pill"
                onClick={transporter.onOpen}
                leadingIcon={<ExternalLink className="size-3" />}
                className="h-7 shrink-0 px-3 text-xs font-semibold"
              >
                Dossier
              </Button>
            )}
          </div>
        </Card>
      )}

      <section className="space-y-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Contact &amp; Identification
        </h4>
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-3.5 text-xs">
          <div className="min-w-0">
            <span className="block text-[10px] text-muted-foreground">Phone</span>
            <span className="flex items-center gap-1 font-semibold text-foreground">
              <Phone className="size-3 shrink-0 text-primary" />
              <span className="truncate">{driver.phone || '—'}</span>
            </span>
          </div>
          <div className="min-w-0">
            <span className="block text-[10px] text-muted-foreground">National ID</span>
            <span className="block truncate font-mono font-semibold text-foreground">
              {driver.nationalId || '—'}
            </span>
          </div>
          <div className="min-w-0">
            <span className="block text-[10px] text-muted-foreground">License Number</span>
            <span className="block truncate font-mono font-semibold text-foreground">
              {driver.drivingLicenseNumber}
            </span>
          </div>
        </div>
      </section>

      {/* What they have driven, where "Assigned Vehicle" used to be.
          A driver has no one truck: they take out whichever is free, and the
          pairing that used to be stored here could disagree with every booking
          they had actually run. The count is the honest version of the same
          question — is this someone who works? */}
      <section className="space-y-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Work
        </h4>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3.5 text-xs">
          {/* A container, not a generic van. Lucide has no container-truck
              glyph, and of the two halves the box is the one that says what
              this fleet actually hauls. */}
          <IconChip icon={ContainerIcon} size={36} />
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground">Container runs</p>
            <p className="truncate text-sm font-black text-foreground">
              {(driver.trips ?? 0).toLocaleString()}{' '}
              <span className="font-bold text-muted-foreground">
                {(driver.trips ?? 0) === 1 ? 'trip' : 'trips'}
              </span>
            </p>
          </div>
        </div>
      </section>

      {footer}
    </div>
  );
}

export interface DriverProfileSheetProps {
  driver: PartnerDriver | null;
  summary: PerformanceSummary;
  onClose: () => void;
  transporter?: DriverProfileOverviewProps['transporter'];
  /** Rendered under the profile — a link out to the driver's full record. */
  footer?: ReactNode;
}

/**
 * The read-only profile as a side sheet.
 *
 * What a transporter's dossier opens when one of its drivers is clicked: the
 * same body the Drivers page shows, without leaving the page the reader is on.
 */
export function DriverProfileSheet({
  driver,
  summary,
  onClose,
  transporter,
  footer,
}: DriverProfileSheetProps) {
  return (
    <Sheet open={Boolean(driver)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        hideCloseButton
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden border-l border-border bg-background p-0 sm:max-w-md"
      >
        <SheetTitle className="sr-only">Driver Profile</SheetTitle>
        <SheetDescription className="sr-only">
          Performance and details for this driver.
        </SheetDescription>
        {driver && (
          <>
            <DriverProfileHeader driver={driver} withClose />
            {/* The body scrolls under the header, which stays put. */}
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5 sm:px-8">
              <DriverProfileOverview
                driver={driver}
                summary={summary}
                transporter={transporter}
                footer={footer}
              />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
