import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Avatar,
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  IconChip,
} from '@/design-system';
import {
  ArrowRight,
  Building2,
  ContainerIcon,
  Link2,
  Package,
  PauseCircle,
  Receipt,
  Repeat,
  Truck,
  UserRound,
  Warehouse,
} from '@/design-system/icons';
import { useBookingsForShipment } from '@/features/bookings/api/queries';
import { useDrivers } from '@/features/drivers/api/queries';
import { usePartner, usePartners } from '@/features/partners/api/queries';
import { useShipment } from '@/features/shipments/api/queries';
import { useShipper, useShippers } from '@/features/shippers/api/queries';
import { CompanyMark } from '@/features/transporter-bi/cards/CompanyLabel';
import { useVehicles } from '@/features/vehicles/api/queries';
import { useTasks } from '@/features/workspace/api/queries';
import { RECORD_TYPE_LABEL, type RecordType } from '@/features/workspace/contracts';
import { recordStatusIntent } from '@/features/workspace/composer/recordStatus';
import { recordHref } from '@/features/workspace/composer/tokens';
import { MissionRowCard } from '@/pages/missions/components/MissionRowCard';
import { cn } from '@/utils';

/**
 * Any Fleetin record, looked at without going to it.
 *
 * Workspace is a conversation about work, and every reference in it used to be
 * a one-way door: click `853220` and you have your answer and no longer have
 * the thread that asked the question. Nine times in ten the reader only wants
 * to know *which* record — whose it is, where it is, what state it is in — and
 * that is a look, not a trip. So every chip opens here first, and `View` is the
 * trip, taken deliberately.
 *
 * **Two shapes, on purpose.** A shipment shows its own row card, because one
 * already exists and it is the one the directory draws — a reader recognises it
 * instantly. Everything else shows the same identity-and-facts block: the
 * reference, the name, the status it is wearing right now, and the four or five
 * facts that answer "which one is this". A bespoke preview per record type
 * would be nine layouts to keep in step with nine ladders.
 *
 * **What it does not do is act.** No status pickers, no assignment, no edit.
 * The record's own page owns its verbs; this is the sentence before the click.
 */

export interface RecordPeekDialogProps {
  recordType: RecordType;
  reference: string;
  label?: string | null;
  status?: string | null;
  parentRef?: string | null;
  recordId?: string | null;
  /**
   * What was said where this chip was clicked.
   *
   * The peek says which record it is; this says why the reader is looking at
   * it. Somebody clicked a reference inside a sentence that asked them to do
   * something, and the sentence scrolls away behind the panel — so it comes
   * with it. Supplied by the message that drew the chip; a chip with no
   * conversation around it simply omits it.
   */
  context?: { author?: string | null; text: string; at?: string | null } | null;
  onClose: () => void;
}

export function RecordPeekDialog({
  recordType,
  reference,
  label,
  status,
  parentRef,
  recordId,
  context,
  onClose,
}: RecordPeekDialogProps) {
  const navigate = useNavigate();

  /* The same destination the chip's own link had, so opening from here and
     opening from a plain link can never disagree. */
  const open = () => {
    onClose();
    navigate(recordHref(recordType, reference, { parentRef, recordId }));
  };

  const shared = { reference, label, status, parentRef, recordId, onOpen: open };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="lg" aria-describedby={undefined}>
        <DialogHeader title={RECORD_TYPE_LABEL[recordType]} />

        <DialogBody className="space-y-3">
          {context?.text ? <SaidHere context={context} /> : null}

          {recordType === 'SHIPMENT' ? (
            <ShipmentPeek reference={reference} onOpen={open} />
          ) : recordType === 'BOOKING' ? (
            <BookingPeek {...shared} />
          ) : recordType === 'VEHICLE' ? (
            <VehiclePeek {...shared} />
          ) : recordType === 'DRIVER' ? (
            <DriverPeek {...shared} />
          ) : recordType === 'PARTNER' ? (
            <PartnerPeek {...shared} />
          ) : recordType === 'SHIPPER' ? (
            <ShipperPeek {...shared} />
          ) : (
            <PeekBody
              recordType={recordType}
              reference={reference}
              title={label ?? reference}
              status={status}
              facts={[]}
            />
          )}

          <OpenAsks recordType={recordType} reference={reference} recordId={recordId} />
        </DialogBody>

        {/* The shipment's card carries its own `View`, so a second button
            underneath it would be the same action twice. */}
        {recordType !== 'SHIPMENT' ? (
          <DialogFooter>
            <Button
              variant="primary"
              size="sm"
              onClick={open}
              trailingIcon={<ArrowRight className="size-3.5" />}
            >
              View {RECORD_TYPE_LABEL[recordType].toLowerCase()}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------------------
 * The two shapes
 * ------------------------------------------------------------------------- */

function ShipmentPeek({ reference, onOpen }: { reference: string; onOpen: () => void }) {
  const { data: mission, isLoading, isError } = useShipment(reference);

  if (isLoading) return <PeekSkeleton />;
  if (isError || !mission) return <PeekMissing reference={reference} />;
  return <MissionRowCard mission={mission} onClick={onOpen} />;
}

interface Fact {
  label: string;
  value: ReactNode;
}

/**
 * One glyph per kind, the same set the chip itself draws.
 *
 * The icon carries the *kind* so hue does not have to — the identity band is
 * the brand's own teal for every record type, and the only other colours in
 * the panel are the ones that mean something: the status, and the company's
 * own logo.
 */
const TYPE_ICON: Record<RecordType, typeof Package> = {
  SHIPMENT: Package,
  BOOKING: ContainerIcon,
  VEHICLE: Truck,
  DRIVER: UserRound,
  PARTNER: Building2,
  SHIPPER: Warehouse,
  INVOICE: Receipt,
  PAYOUT_HOLD: PauseCircle,
  EMPTY_RETURN_CYCLE: Repeat,
  EMPTY_RETURN_CHAIN: Link2,
};

/**
 * Identity, then facts.
 *
 * The reference is the loudest thing in the block because it is what the
 * reader clicked and what they are checking they landed on; the status sits
 * beside it in the intent the chip itself wore, so the popup and the chip that
 * opened it can never disagree about what state the record is in.
 */
function PeekBody({
  recordType,
  reference,
  title,
  status,
  facts,
  logoName,
  logoId,
  logoUrl,
  personName,
  personAvatar,
  busy = false,
}: {
  recordType: RecordType;
  reference: string;
  title: string;
  status?: string | null;
  facts: Fact[];
  /** A company whose mark should lead the panel — its logo, or its initials. */
  logoName?: string | null;
  logoId?: string | null;
  logoUrl?: string | null;
  /** A person: their photo, or their initials. */
  personName?: string | null;
  personAvatar?: string | null;
  busy?: boolean;
}) {
  const known = facts.filter(
    (fact) => fact.value !== null && fact.value !== undefined && fact.value !== '',
  );
  const Icon = TYPE_ICON[recordType];

  return (
    <div className="overflow-hidden rounded-lg border border-border/80">
      {/* The identity band.
       *
       * Filled, not white: a panel of white on white gave the reader no anchor
       * and made the reference — the one thing they clicked to check — sit at
       * the same weight as the fields under it. `primary-subtle` was tried
       * first and is a wash so pale it read as white anyway. This is the
       * shipment masthead's own slab, and it is one colour for every record
       * type on purpose: hue in this product means status, and spending it on
       * "this is a vehicle" would leave the status badge beside it with
       * nothing left to say.
       *
       * The mark leads: a company shows its real logo where one is on file
       * (`CompanyMark` falls back to its initials), a person shows their
       * photo, and everything else shows its kind's glyph on the house disc. */}
      <div className="flex items-center gap-3 bg-primary-bold px-4 py-3.5 text-primary-bold-foreground">
        {logoName ? (
          <CompanyMark
            id={logoId ?? undefined}
            name={logoName}
            logoUrl={logoUrl ?? undefined}
            size="sm"
            className="size-11 ring-2 ring-white/70"
          />
        ) : personName ? (
          <Avatar
            size="lg"
            name={personName}
            src={personAvatar ?? undefined}
            className="shrink-0 ring-2 ring-white/70"
          />
        ) : (
          <IconChip icon={Icon} tint="on-teal" size={44} />
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-lg font-extrabold leading-none tracking-tight">
            {reference}
          </p>
          {title && title !== reference ? (
            <p className="mt-1 truncate text-[13px] font-semibold opacity-85">{title}</p>
          ) : null}
        </div>

        {status ? (
          <Badge
            variant="solid"
            intent={recordStatusIntent(recordType, status)}
            size="sm"
            className="shrink-0 uppercase tracking-[0.08em]"
          >
            {status}
          </Badge>
        ) : null}
      </div>

      {busy ? (
        <div className="grid grid-cols-2 gap-x-5 gap-y-3 bg-card px-4 py-3.5 sm:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="h-8 animate-pulse rounded-md bg-secondary/50 motion-reduce:animate-none" />
          ))}
        </div>
      ) : known.length > 0 ? (
        <dl className="grid grid-cols-2 gap-x-5 gap-y-3 bg-card px-4 py-3.5 sm:grid-cols-3">
          {known.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                {fact.label}
              </dt>
              <dd className={cn('mt-0.5 truncate text-[13px] font-medium text-foreground')}>
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="bg-card px-4 py-4 text-[13px] text-muted-foreground">
          Nothing more to show here — open the record for the full detail.
        </p>
      )}
    </div>
  );
}

/** The line that sent the reader here, kept in front of them. */
function SaidHere({
  context,
}: {
  context: { author?: string | null; text: string; at?: string | null };
}) {
  return (
    <div className="rounded-lg border border-l-[3px] border-border/80 border-l-primary bg-surface-sunken px-4 py-3">
      <p className="text-[13px] leading-relaxed text-foreground">{context.text}</p>
      {context.author ? (
        <p className="mt-1.5 text-[11px] font-semibold text-muted-foreground">
          {context.author}
          {context.at ? ` · ${context.at.slice(0, 10)}` : ''}
        </p>
      ) : null}
    </div>
  );
}

/**
 * What is already being said about this record.
 *
 * The peek answers "which one is this"; this answers "and why am I looking at
 * it". Somebody clicked a reference inside a message that asked them to do
 * something — the ask itself is the context, and without it the reader has the
 * record but not the job. Every open task raised on this record shows here in
 * the words its author used, with who it is on and when it is due.
 *
 * Open only. A closed task is history and belongs on the record's own page;
 * this list exists to say what is still outstanding. Nothing renders at all
 * when there is nothing outstanding — an empty "no open tasks" panel is a row
 * of furniture for an answer nobody asked for.
 */
/** Workspace people arrive as two fields; every line here wants one name. */
const personName = (person: { firstName: string; lastName: string }) =>
  `${person.firstName} ${person.lastName}`.trim();

function OpenAsks({
  recordType,
  reference,
  recordId,
}: {
  recordType: RecordType;
  reference: string;
  recordId?: string | null;
}) {
  /* `recordId` on this filter takes an id OR a reference — the API resolves
     both — so a chip typed into a message finds its tasks just as a hydrated
     task link does. */
  const { data } = useTasks({
    recordType,
    recordId: recordId ?? reference,
    status: ['OPEN', 'IN_PROGRESS', 'WAITING'],
    pageSize: 4,
  });

  const tasks = data?.items ?? [];
  if (tasks.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-border/80">
      <p className="border-b border-border-subtle bg-surface-sunken px-4 py-2 text-[10px] font-extrabold uppercase tracking-[0.09em] text-muted-foreground">
        Open on this {RECORD_TYPE_LABEL[recordType].toLowerCase()}
        {data && data.total > tasks.length ? ` · ${tasks.length} of ${data.total}` : ''}
      </p>
      <ul className="divide-y divide-border-subtle bg-card">
        {tasks.map((task) => (
          <li key={task.id} className="flex items-start gap-3 px-4 py-2.5">
            <span
              aria-hidden
              className={cn(
                'mt-1.5 size-2 shrink-0 rounded-full',
                task.priority === 'URGENT' || task.priority === 'HIGH'
                  ? 'bg-destructive'
                  : 'bg-primary',
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-foreground">{task.title}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {[
                  task.createdBy ? `raised by ${personName(task.createdBy)}` : null,
                  task.assignee ? `on ${personName(task.assignee)}` : 'unassigned',
                  task.dueAt ? `due ${task.dueAt.slice(0, 10)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <span className="shrink-0 font-mono text-[10.5px] font-bold text-muted-foreground">
              {task.reference}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PeekSkeleton() {
  return <div className="h-[168px] animate-pulse rounded-lg border border-border/80 bg-secondary/40 motion-reduce:animate-none" />;
}

function PeekMissing({ reference }: { reference: string }) {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground">
      <span className="font-mono font-semibold">{reference}</span> could not be loaded.
    </p>
  );
}

/* ---------------------------------------------------------------------------
 * One resolver per type
 *
 * Each of these answers the same question — "which record is this?" — from
 * whatever the caller happened to hold. A chip typed into a message carries a
 * reference and nothing else; one hydrated from a task link also carries a
 * uuid. Every resolver below therefore matches on both, and degrades to the
 * identity block rather than to an error when the record cannot be reached.
 * ------------------------------------------------------------------------- */

interface PeekPartProps {
  reference: string;
  label?: string | null;
  status?: string | null;
  parentRef?: string | null;
  recordId?: string | null;
  onOpen: () => void;
}

const dateOnly = (value?: string | null) => (value ? value.slice(0, 10) : null);

function BookingPeek({ reference, label, status, parentRef, recordId }: PeekPartProps) {
  /* Keyed by the shipment REFERENCE — the same bucket the shipment page fills,
     so opening a booking's peek and then its shipment costs one fetch, not
     two. See `bookingQueryKeys`. */
  const { data: bookings, isLoading } = useBookingsForShipment(parentRef ?? undefined);
  const booking = bookings?.find((row) => row.reference === reference || row.id === recordId);

  return (
    <PeekBody
      recordType="BOOKING"
      reference={reference}
      title={booking?.containerNumber ?? label ?? reference}
      status={booking?.status ?? status}
      busy={Boolean(parentRef) && isLoading}
      facts={[
        { label: 'Shipment', value: parentRef },
        { label: 'Container', value: booking?.containerNumber },
        { label: 'Shipping line', value: booking?.shippingLine },
        { label: 'Cargo', value: booking?.cargoType },
        { label: 'Pickup', value: dateOnly(booking?.scheduledPickupTime) },
        { label: 'Return deadline', value: dateOnly(booking?.containerReturnDeadline) },
      ]}
    />
  );
}

function VehiclePeek({ reference, label, status, recordId }: PeekPartProps) {
  const { data } = useVehicles({ search: reference, limit: 10 });
  const vehicle = data?.items?.find(
    (row) => row.id === recordId || row.reference === reference || row.plateNumber === reference,
  );

  return (
    <PeekBody
      recordType="VEHICLE"
      reference={vehicle?.plateNumber ?? reference}
      title={vehicle ? `${vehicle.truckType}${vehicle.make ? ` · ${vehicle.make}` : ''}` : (label ?? reference)}
      status={vehicle?.operationalStatus ?? status}
      logoName={vehicle?.partnerName ?? null}
      logoId={vehicle?.partnerId ?? null}
      logoUrl={vehicle?.partnerLogo ?? null}
      facts={[
        { label: 'Transporter', value: vehicle?.partnerName },
        { label: 'Type', value: vehicle?.truckType },
        { label: 'Capacity', value: vehicle?.containerCapacity },
        { label: 'Ownership', value: vehicle?.ownershipType },
        { label: 'Insurance to', value: dateOnly(vehicle?.insuranceExpiry) },
        { label: 'Registration to', value: dateOnly(vehicle?.registrationExpiry) },
      ]}
    />
  );
}

function DriverPeek({ reference, label, status, recordId }: PeekPartProps) {
  const { data } = useDrivers({ search: reference, limit: 10 });
  const driver = data?.items?.find((row) => row.id === recordId || row.reference === reference);

  return (
    <PeekBody
      recordType="DRIVER"
      reference={driver?.reference ?? reference}
      title={driver?.fullName ?? label ?? reference}
      status={driver?.status ?? status}
      personName={driver?.fullName ?? label ?? reference}
      personAvatar={driver?.profilePictureUrl}
      facts={[
        { label: 'Transporter', value: driver?.partnerName },
        { label: 'Phone', value: driver?.phone },
        { label: 'Licence', value: driver?.drivingLicenseNumber },
        { label: 'Trips', value: driver?.trips != null ? String(driver.trips) : null },
      ]}
    />
  );
}

function PartnerPeek({ reference, label, status, recordId }: PeekPartProps) {
  /* Two ways in, because a chip carries whatever its author had. The detail
     endpoint wants the row's own id; a reference typed into a message is not
     that, and the search list is what turns one into the other. */
  const { data: byId } = usePartner(recordId ?? reference);
  const { data: found } = usePartners({ search: reference, limit: 10 });
  const partner =
    byId ??
    found?.items?.find((row) => row.id === recordId || row.reference === reference);

  return (
    <PeekBody
      recordType="PARTNER"
      reference={partner?.reference ?? reference}
      title={partner?.companyLegalName ?? label ?? reference}
      status={status}
      logoName={partner?.companyLegalName ?? label ?? null}
      logoId={partner?.id ?? recordId ?? null}
      /* Straight off the record, not only through the logo registry: the
         registry is filled by the pages that list companies, and a peek can be
         the first thing in a session that mentions this one. */
      logoUrl={partner?.logoUrl ?? null}
      facts={[
        { label: 'Fleet', value: partner?.fleetSize != null ? String(partner.fleetSize) : null },
        { label: 'Country', value: partner?.country },
        { label: 'Regions', value: partner?.operatingRegions?.join(', ') },
        { label: 'Services', value: partner?.serviceCategories?.join(', ') },
        { label: 'Registration', value: partner?.registrationNumber },
      ]}
    />
  );
}

function ShipperPeek({ reference, label, status, recordId }: PeekPartProps) {
  const { data: byId } = useShipper(recordId ?? reference);
  const { data: found } = useShippers({ search: reference, limit: 10 });
  const shipper =
    byId ??
    found?.items?.find((row) => row.id === recordId || row.reference === reference);

  return (
    <PeekBody
      recordType="SHIPPER"
      reference={shipper?.reference ?? reference}
      title={shipper?.companyLegalName ?? label ?? reference}
      status={status}
      logoName={shipper?.companyLegalName ?? label ?? null}
      logoId={shipper?.id ?? recordId ?? null}
      logoUrl={shipper?.logoUrl ?? null}
      facts={[
        { label: 'Industry', value: shipper?.industry },
        { label: 'Country', value: shipper?.country },
        { label: 'Contact', value: shipper?.primaryContact?.name },
        { label: 'Active shipments', value: shipper?.activeShipments != null ? String(shipper.activeShipments) : null },
        { label: 'Past shipments', value: shipper?.pastShipments != null ? String(shipper.pastShipments) : null },
      ]}
    />
  );
}

export default RecordPeekDialog;
