import {
  Building2,
  Clock,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Upload,
  XCircle,
} from '@/design-system/icons';
import { Badge, Button, Card, IconButton, Tooltip, VerificationBadge } from '@/design-system';
import { ShipperCoverMap } from '@/features/shipper-bi';
import type { ApprovalStatus, ShipperRecord } from '@/types/shipper';
import { formatDate } from '@/utils/format';

/**
 * Who this account is, over a cover of where their freight currently is.
 *
 * The profile shape — cover, then a mark overlapping it, then the name and the
 * actions — is borrowed deliberately: a shipper record is an account page, and
 * readers already know where to look on one.
 *
 * The cover is the live corridor rather than a photograph. It is the only thing
 * about this shipper that is true on all three tabs, so it belongs above the
 * tab strip instead of inside the control tower; and it earns its 280px by
 * answering "where is my freight" before the reader has clicked anything. A
 * decorative banner in the same slot would cost the same space and answer
 * nothing.
 *
 * Everything in the band below it is a fact about the company that does not
 * change hour to hour. The figures that do change live in the health strip, one
 * component down, where they can carry a comparison.
 */

const COVER_HEIGHT = 280;

export interface ShipperIdentityHeaderProps {
  shipper: ShipperRecord;
  onEdit: () => void;
  onUploadDocument: () => void;
}

export function ShipperIdentityHeader({
  shipper,
  onEdit,
  onUploadDocument,
}: ShipperIdentityHeaderProps) {
  const contact = shipper.primaryContact;

  return (
    <Card variant="default" padding="none" className="overflow-hidden">
      <ShipperCoverMap shipperId={shipper.id} height={COVER_HEIGHT} />

      <div className="flex flex-col gap-4 px-5 pb-5 sm:px-6 sm:pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          {/* The mark rides the seam between cover and band, which is what makes
              the two read as one record rather than a map with a card under it. */}
          <div className="flex min-w-0 items-end gap-4">
            <div className="relative z-10 -mt-12 flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-sunken ring-4 ring-surface sm:-mt-14 sm:size-28">
              {shipper.logoUrl ? (
                <img src={shipper.logoUrl} alt="" className="size-full object-cover" loading="lazy" />
              ) : (
                <Building2 className="size-9 text-muted-foreground" />
              )}
            </div>

            <div className="min-w-0 pb-0.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="type-h1 truncate text-foreground">{shipper.companyLegalName}</h1>
                <ApprovalBadge status={shipper.approvalStatus} />
              </div>
            </div>
          </div>

          {/* Actions. Reaching the account's contact is one of them — it is the
              most common reason an operator opens this page at all. */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Tooltip content={`Call ${contact.name} · ${contact.phone}`}>
              <IconButton aria-label={`Call ${contact.name}`} variant="outline" size="sm" asChild>
                <a href={`tel:${contact.phone}`}>
                  <Phone />
                </a>
              </IconButton>
            </Tooltip>

            <Tooltip content={`Email ${contact.name} · ${contact.email}`}>
              <IconButton aria-label={`Email ${contact.name}`} variant="outline" size="sm" asChild>
                <a href={`mailto:${contact.email}`}>
                  <Mail />
                </a>
              </IconButton>
            </Tooltip>

            <Button
              variant="outline"
              size="sm"
              onClick={onUploadDocument}
              leadingIcon={<Upload className="size-4" />}
            >
              Upload document
            </Button>

            <Button size="sm" onClick={onEdit} leadingIcon={<Pencil className="size-4" />}>
              Edit profile
            </Button>
          </div>
        </div>

        {/* One line of reference data, in the order it gets quoted. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 type-body-xs text-muted-foreground">
          <span className="type-mono text-foreground">{shipper.reference ?? shipper.id}</span>
          <Separator />
          <span className="inline-flex items-center gap-1.5">
            <FileText className="size-3.5 shrink-0" aria-hidden />
            <span className="type-mono">{shipper.registrationNumber}</span>
          </span>
          <Separator />
          <span>{shipper.industry}</span>
          <Separator />
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            {shipper.address}, {shipper.country}
          </span>
          <Separator />
          <span>Shipper since {formatDate(shipper.registrationDate)}</span>
        </div>
      </div>
    </Card>
  );
}

function Separator() {
  return (
    <span className="text-border-strong" aria-hidden>
      ·
    </span>
  );
}

function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  switch (status) {
    // The same bare tick every other verified record gets — see
    // `VerificationBadge`. This used to be its own solid pill reading
    // "Verified shipper," a third visual style for the same fact.
    case 'Verified':
      return <VerificationBadge state="verified" size="lg" />;
    case 'Pending':
      return (
        <Badge intent="warning" size="sm">
          <Clock aria-hidden />
          Onboarding
        </Badge>
      );
    case 'Canceled':
      return (
        <Badge intent="destructive" size="sm">
          <XCircle aria-hidden />
          Deactivated
        </Badge>
      );
  }
}
