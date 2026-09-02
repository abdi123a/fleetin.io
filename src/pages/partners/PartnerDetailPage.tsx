import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileText,
  Handshake,
  MapPin,
  Pencil,
  Trash2,
  Truck,
  X,
  Phone,
  Mail,
  User,
  Plus,
  Package,
  Search,
} from '@/design-system/icons';
import { DocumentViewerModal, type DocumentToView } from '@/components/DocumentViewerModal';
import {
  Star,
  Users,
} from 'lucide-react';
import { PageHeader, TablePager, usePagedRows } from '@/components';
import { MissionRowCard } from '@/pages/missions/components/MissionRowCard';
import { useShipments } from '@/features/shipments/api/queries';
import {
  useAddDispatcher,
  useRemoveDispatcher,
} from '@/features/partners/api/queries';
import { useConfirm } from '@/design-system';
import {
  Badge,
  Button,
  Card,
  Input,
  Select,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  VerificationBadge,
} from '@/design-system';
import { ROUTES, buildPath } from '@/config/routes';
import { cn, isDriverVerified, isVehicleVerified } from '@/utils';
import {
  type PartnerDriver,
  type PartnerVehicle,
  type TruckType,
  type DispatcherContact,
} from '@/types/partner';
import { AddPartnerForm, type PartnerFormData } from './AddPartnerForm';
import {
  usePartner,
  useUpdatePartner,
  useUploadPartnerLogo,
} from '@/features/partners/api/queries';
import { useCreateDriver, useDeleteDriver } from '@/features/drivers/api/queries';
import { useCreateVehicle, useDeleteVehicle } from '@/features/vehicles/api/queries';
import { useBreadcrumbLabel } from '@/hooks/useBreadcrumbLabel';
import { useBookings } from '@/features/bookings/api/queries';
import type { BookingRecord } from '@/features/bookings/api/bookingsService';
import { PerformancePanel } from '@/components/performance';
import { useDocumentBook } from '@/features/documents/api/queries';
import {
  byUrgency,
  complianceFindings,
  tallyFindings,
  type ComplianceOwner,
} from '@/features/documents';
import { DriverProfileSheet } from '@/components/drivers';
import { UNRATED, summariseFleet, summarisePerformance } from '@/lib/rating';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Two, not three.
 *
 * "Fleet & Compliance" was a third tab holding a vehicle grid and a compliance
 * panel, both of which said what the overview already said — and the papers
 * themselves belong in Fleetin Drive, where every document in the company
 * lives. A tab whose content is a longer version of the page behind it is a
 * place readers go to check they have not missed something.
 */
type WorkspaceTab = 'overview' | 'shipments';

const TRUCK_TYPE_OPTIONS: { value: TruckType; label: string }[] = [
  { value: 'Flatbed', label: 'Flatbed' },
  { value: '20ft Container', label: '20ft Container' },
  { value: '40ft Container', label: '40ft Container' },
  { value: 'Refrigerated', label: 'Refrigerated' },
  { value: 'Tanker', label: 'Tanker' },
  { value: 'Tipper', label: 'Tipper' },
  { value: 'Box Truck', label: 'Box Truck' },
  { value: 'Low Loader', label: 'Low Loader' },
  { value: 'Other', label: 'Other' },
];



// ─── Sub-components ───────────────────────────────────────────────────────────


// ─── Page Component ───────────────────────────────────────────────────────────

/**
 * One number under one word — the shape the fleet counts already use.
 *
 * A zero is always muted, whatever the figure means. "0 expired" in red is an
 * alarm about the absence of an alarm, and a row of four coloured zeros is the
 * clearest possible way to make a clean carrier look like a problem.
 */
function ComplianceFigure({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/70 bg-secondary/30 px-3 py-2">
      <p
        className={cn(
          'font-mono text-lg font-bold leading-none tabular-nums',
          value === 0 ? 'text-muted-foreground' : tone,
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
    </div>
  );
}


/* ---------------------------------------------------------------------------
 * The overview's three building blocks
 * ------------------------------------------------------------------------- */

/**
 * Everybody worth ringing at this carrier, and a way to add the next one.
 *
 * The page held exactly ONE contact, at the bottom, under the driver roster —
 * and a haulier is not one person. There is a dispatcher who answers in the day
 * and an owner who answers at night, and the record only ever kept whichever
 * was typed into the onboarding form, so the second number lived in somebody's
 * phone and left with them.
 *
 * The `Contact` table has been one-to-many since it was written, and the
 * add/update/delete endpoints have existed the whole time. Nothing in the app
 * had ever called them.
 *
 * The primary is marked and cannot be deleted from here: it is the number the
 * rest of the app prints when it needs "the transporter", and a list you can
 * empty is a list that will be emptied.
 */
function ContactsCard({
  partnerId,
  contacts,
  onChanged,
}: {
  partnerId: string;
  contacts: DispatcherContact[];
  onChanged: (message: string) => void;
}) {
  const addContact = useAddDispatcher();
  const removeContact = useRemoveDispatcher();
  const { confirm, confirmDialog } = useConfirm();

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', title: '', phone: '', email: '' });
  const [error, setError] = useState('');

  const save = () => {
    if (!draft.name.trim() || !draft.phone.trim()) {
      setError('A contact needs at least a name and a number.');
      return;
    }
    setError('');
    addContact.mutate(
      {
        partnerId,
        payload: {
          name: draft.name.trim(),
          title: draft.title.trim() || 'Contact',
          phone: draft.phone.trim(),
          email: draft.email.trim(),
        },
      },
      {
        onSuccess: () => {
          onChanged(`${draft.name.trim()} added.`);
          setDraft({ name: '', title: '', phone: '', email: '' });
          setAdding(false);
        },
        onError: (caught) =>
          setError(caught instanceof Error ? caught.message : 'The contact could not be saved.'),
      },
    );
  };

  const drop = async (contact: DispatcherContact) => {
    const ok = await confirm({
      title: `Remove ${contact.name}?`,
      description: 'They stop being a contact for this transporter. Nothing else changes.',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    removeContact.mutate(
      { partnerId, contactId: contact.id },
      { onSuccess: () => onChanged(`${contact.name} removed.`) },
    );
  };

  return (
    <Card className="space-y-3 rounded-lg border border-border/80 bg-card p-4 shadow-2xs @[40rem]/panel:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
        <div className="flex items-center gap-2">
          <User className="h-4.5 w-4.5 text-primary" />
          <h4 className="type-h4 font-semibold text-foreground">Contacts</h4>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAdding((was) => !was)}
          leadingIcon={adding ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          className="shrink-0 rounded-full text-xs"
        >
          {adding ? 'Cancel' : 'Add contact'}
        </Button>
      </div>

      {adding && (
        <div className="space-y-2.5 rounded-lg border border-primary/30 bg-primary/5 p-3 animate-in fade-in">
          <div className="grid grid-cols-1 gap-2.5 @[28rem]/panel:grid-cols-2">
            <Input
              autoFocus
              placeholder="Name"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
            <Input
              placeholder="Role (e.g. Night dispatcher)"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            />
            <Input
              placeholder="Phone"
              value={draft.phone}
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
            />
            <Input
              placeholder="Email"
              type="email"
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
            />
          </div>
          {error && <p className="text-[11px] font-medium text-destructive">{error}</p>}
          <div className="flex justify-end">
            <Button size="sm" disabled={addContact.isPending} onClick={save} className="rounded-full px-4 text-xs">
              {addContact.isPending ? 'Saving…' : 'Save contact'}
            </Button>
          </div>
        </div>
      )}

      {contacts.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nobody on file — add the dispatcher you call.</p>
      ) : (
        <div className="grid gap-2 @[34rem]/panel:grid-cols-2">
          {contacts.map((contact, index) => (
            <div
              key={contact.id || `${contact.name}-${index}`}
              className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/20 p-2.5"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                {contact.name.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-xs font-bold text-foreground">{contact.name}</span>
                  {index === 0 && (
                    <Badge intent="primary" variant="subtle" size="sm">
                      Primary
                    </Badge>
                  )}
                </div>
                <span className="block truncate text-[11px] text-muted-foreground">{contact.title}</span>
                {/* Tel and mailto, because the reason this card exists is to be
                    acted on — a number you have to select and copy is a number
                    that gets misread. */}
                <a
                  href={`tel:${contact.phone}`}
                  className="mt-1 flex items-center gap-1.5 font-mono text-[11px] font-medium text-foreground hover:text-primary"
                >
                  <Phone className="size-3 shrink-0 text-primary" />
                  {contact.phone}
                </a>
                {contact.email && (
                  <a
                    href={`mailto:${contact.email}`}
                    className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground hover:text-primary"
                  >
                    <Mail className="size-3 shrink-0 text-primary" />
                    <span className="truncate">{contact.email}</span>
                  </a>
                )}
              </div>
              {index > 0 && contact.id && (
                <button
                  type="button"
                  onClick={() => void drop(contact)}
                  aria-label={`Remove ${contact.name}`}
                  title={`Remove ${contact.name}`}
                  className="shrink-0 rounded-sm p-1 text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {confirmDialog}
    </Card>
  );
}

/** A titled list with a count and one action — the shell both rosters share. */
function MinimalRoster({
  title,
  icon: Icon,
  count,
  action,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="space-y-2.5 rounded-lg border border-border/80 bg-card p-4 shadow-2xs @[40rem]/panel:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
        <div className="flex items-center gap-2">
          <Icon className="h-4.5 w-4.5 text-primary" />
          <h4 className="type-h4 font-semibold text-foreground">{title}</h4>
          <span className="text-xs font-medium text-muted-foreground">{count}</span>
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

/**
 * One truck or one driver, in a line.
 *
 * Three facts and a way in: what it is called, what kind it is, how much work
 * it has done. Everything else — capacity, status, licence dates, papers — is
 * on that record's own sheet, which is what the row opens.
 *
 * The grid of bordered tiles this replaced gave a truck four fields, two
 * badges and a delete button inside 150 pixels, and forty trucks was most of
 * the page. A fleet list is scanned, not studied.
 */
function RosterRow({
  name,
  meta,
  mono = false,
  verified,
  figure,
  figureLabel,
  stars,
  onOpen,
  onRemove,
  removeLabel,
}: {
  name: string;
  meta?: string;
  /** Plates are read character by character; names are not. */
  mono?: boolean;
  verified: boolean;
  figure: number;
  figureLabel: string;
  stars?: number;
  onOpen: () => void;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <div className="group flex items-center gap-1 border-b border-border/40 last:border-b-0">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-primary/5"
      >
        {/* One line, not two. The plate and its type were stacked, which made a
            row two lines tall for two values that fit side by side — eight of
            those was the whole viewport, for a list whose job is to be glanced
            at on the way somewhere else. */}
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span
            className={cn(
              'truncate text-xs font-bold text-foreground',
              mono && 'font-mono text-[13px] font-extrabold',
            )}
          >
            {name}
          </span>
          {meta && (
            <span className="hidden truncate text-[11px] text-muted-foreground @[24rem]/panel:inline">
              {meta}
            </span>
          )}
        </span>

        <VerificationBadge state={verified ? 'verified' : 'unverified'} size="sm" />

        {stars !== undefined && stars > 0 && (
          <span className="hidden shrink-0 items-center gap-0.5 @[26rem]/panel:inline-flex">
            <Star aria-hidden className="size-3 fill-warning text-warning" />
            <span className="text-[11px] font-bold tabular-nums text-foreground">
              {stars.toFixed(1)}
            </span>
          </span>
        )}

        {/* The figure and its noun on one line: "3 trips" is a phrase, and
            stacking it put a 10px label under a 12px number for no gain. */}
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          <span className="font-bold text-foreground">{figure}</span> {figureLabel}
        </span>

        <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      </button>

      {/* Revealed on hover, present for the keyboard. Eight bins down the right
          edge of a roster is eight invitations to the one action nobody came
          here for. */}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        title={removeLabel}
        className="shrink-0 rounded-sm p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function PartnerDetailPage() {
  const navigate = useNavigate();
  const { id: partnerId } = useParams<{ id: string }>();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');

  const { data: partner, isLoading: isPartnerLoading } = usePartner(partnerId);
  useBreadcrumbLabel(partner?.companyLegalName);
  const updatePartnerMutation = useUpdatePartner();
  const uploadLogo = useUploadPartnerLogo();
  const createDriverMutation = useCreateDriver();
  const deleteDriverMutation = useDeleteDriver();
  const createVehicleMutation = useCreateVehicle();
  const deleteVehicleMutation = useDeleteVehicle();

  const drivers = useMemo<PartnerDriver[]>(() => partner?.drivers ?? [], [partner]);
  const vehicles = useMemo<PartnerVehicle[]>(() => partner?.vehicles ?? [], [partner]);

  /* Clicking a driver used to navigate to the Drivers page. Being thrown out
     of a transporter's dossier to read one of its own drivers is the wrong
     answer — the profile opens here instead, over the dossier. */
  const [openDriverId, setOpenDriverId] = useState<string | null>(null);

  // ── Driver form ──
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [newDriver, setNewDriver] = useState<Partial<PartnerDriver>>({ status: 'Available', joinDate: new Date().toISOString().split('T')[0] });

  // ── Vehicle form ──
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [newVehicle, setNewVehicle] = useState<Partial<PartnerVehicle>>({ truckType: '40ft Container', ownershipType: 'Owned', operationalStatus: 'Available', hasGPS: false });

  // ── Document form ──
  const [viewingDoc, setViewingDoc] = useState<DocumentToView | null>(null);

  // ── Shipments search & filter ──
  /* Each dossier tab pages independently — a partner with sixty trucks should
     not make the fleet tab a scroll, and its shipment history even less so. */
  /* Five. These two rosters sit one above the other on a page that also holds
     contacts, performance and papers — at twelve rows each they were most of
     the scroll, and a fleet list is something you glance at on the way to
     something else. The pager is right there for the sixth. */
  const [driversPageSize, setDriversPageSize] = useState(5);
  const [vehiclesPageSize, setVehiclesPageSize] = useState(5);
  const [shipmentsPageSize, setShipmentsPageSize] = useState(12);

  const [shipmentSearch, setShipmentSearch] = useState('');

  const showSuccess = (msg: string) => {
    setSuccessNotice(msg);
    setTimeout(() => setSuccessNotice(null), 5000);
  };

  const { confirm, confirmDialog } = useConfirm();


  // ── Handlers ──
  const handleEditSuccess = (formData: PartnerFormData) => {
    if (!partner) return;
    /* Its own request: the logo goes to `/partners/:id/logo` as multipart, not
       as a field on the profile PATCH. Fired alongside rather than awaited —
       the profile save is what the operator is waiting on, and a failed logo
       upload should not lose the rest of the edit. */
    if (formData.logo) {
      uploadLogo.mutate({ id: partner.id, file: formData.logo });
    }
    updatePartnerMutation.mutate(
      {
        id: partner.id,
        payload: {
          companyLegalName: formData.companyLegalName,
          registrationNumber: formData.registrationNumber,
          businessLicenseNumber: formData.businessLicenseNumber,
          country: formData.country,
          address: formData.address,
          operatingRegions: formData.operatingRegions.split(',').map((s) => s.trim()).filter(Boolean),
          serviceCategories: formData.serviceCategories.split(',').map((s) => s.trim()).filter(Boolean),
          fleetSize: parseInt(formData.fleetSize) || partner.fleetSize,
          insuranceProvider: formData.insuranceProvider,
          insurancePolicyNumber: formData.insurancePolicyNumber,
          insuranceExpiry: formData.insuranceExpiry,
          partnerStatus: formData.partnerStatus,
          primaryDispatcher: {
            name: formData.primaryDispatcherName || partner.primaryDispatcher.name,
            title: formData.primaryDispatcherTitle || partner.primaryDispatcher.title,
            phone: formData.primaryDispatcherPhone || partner.primaryDispatcher.phone,
            email: formData.primaryDispatcherEmail || partner.primaryDispatcher.email,
          },
        },
      },
      { onSuccess: () => showSuccess('Transporter profile updated.') },
    );
    setIsEditOpen(false);
  };

  const handleAddDriver = () => {
    const { fullName, drivingLicenseNumber } = newDriver;
    if (!fullName?.trim() || !drivingLicenseNumber?.trim() || !partner) return;
    createDriverMutation.mutate(
      {
        partnerId: partner.id,
        payload: {
          fullName,
          phone: newDriver.phone || '',
          nationalId: newDriver.nationalId || '',
          drivingLicenseNumber,
          status: newDriver.status || 'Available',
          joinDate: (newDriver.joinDate ?? new Date().toISOString().split('T')[0]) as string,
        },
      },
      { onSuccess: () => showSuccess(`Driver "${fullName}" added.`) },
    );
    setNewDriver({ status: 'Available', joinDate: new Date().toISOString().split('T')[0] });
    setShowAddDriver(false);
  };

  const handleDeleteDriver = async (drvId: string) => {
    const ok = await confirm({
      title: 'Remove this driver?',
      description: 'They will be removed from this transporter and unassigned from any future bookings.',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    deleteDriverMutation.mutate(drvId, { onSuccess: () => showSuccess('Driver removed.') });
  };

  const handleAddVehicle = () => {
    const { plateNumber } = newVehicle;
    if (!plateNumber?.trim() || !partner) return;
    createVehicleMutation.mutate(
      {
        partnerId: partner.id,
        payload: {
          plateNumber,
          truckType: newVehicle.truckType || '40ft Container',
          containerCapacity: newVehicle.containerCapacity,
          trailerInfo: newVehicle.trailerInfo,
          ownershipType: newVehicle.ownershipType || 'Owned',
          insuranceExpiry: newVehicle.insuranceExpiry || '',
          registrationExpiry: newVehicle.registrationExpiry || '',
          hasGPS: newVehicle.hasGPS || false,
          gpsDeviceId: newVehicle.gpsDeviceId,
          operationalStatus: newVehicle.operationalStatus || 'Available',
          year: newVehicle.year,
          make: newVehicle.make,
          model: newVehicle.model,
        },
      },
      { onSuccess: () => showSuccess(`Vehicle "${plateNumber}" registered.`) },
    );
    setNewVehicle({ truckType: '40ft Container', ownershipType: 'Owned', operationalStatus: 'Available', hasGPS: false });
    setShowAddVehicle(false);
  };

  const handleDeleteVehicle = async (vehId: string) => {
    const ok = await confirm({
      title: 'Remove this vehicle?',
      description: 'It will leave the fleet and be unassigned from any future bookings.',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    deleteVehicleMutation.mutate(vehId, { onSuccess: () => showSuccess('Vehicle removed.') });
  };



  /**
   * The containers this transporter is actually carrying — real `Booking`
   * rows, filtered server-side by `partnerId`.
   *
   * This used to read the shipment store and filter by `transporter.id`,
   * which was wrong twice over: a shipment names one primary transporter
   * even when its containers are split across several, and its status is the
   * *job's*, not this carrier's. That is why a transporter with five
   * delivered containers displayed "Delivered 0". Cancelled/failed bookings
   * are excluded — this tab is the working book.
   */
  const { data: bookingPage } = useBookings({ partnerId: partner?.id }, { enabled: Boolean(partner?.id) });
  /**
   * The shipments this carrier has actually worked.
   *
   * Whole jobs, from `/shipments?transporterId=` — which since 2026-09-02
   * matches on the carrier's BOOKINGS as well as the shipment's creation-time
   * transporter field, so a job it ran three containers on shows up even when
   * somebody else was named on it.
   *
   * This replaced a list built from the bookings themselves, which produced one
   * row per container: a twenty-box shipment split with another haulier
   * appeared twelve times over, same route, same shipper, and grouping them
   * back into jobs was left to the reader.
   */
  const { data: missionPage } = useShipments({ transporterId: partner?.id, limit: 200 });
  const partnerMissions = useMemo(() => missionPage?.items ?? [], [missionPage]);

  /**
   * This carrier's record, and each of its drivers'.
   *
   * Both read the same booking rows the tab below already loaded — one request,
   * and the carrier's star and its drivers' stars can never disagree because
   * they are the same arithmetic over the same set. Cancelled and failed
   * bookings are deliberately *kept* here, unlike `partnerShipments`: they are
   * the whole of the reliability axis.
   */
  const partnerBookings = useMemo(() => bookingPage?.items ?? [], [bookingPage]);

  /* Primary first, then everyone else. The backend already orders contacts
     `isPrimary desc` and splits the first one out; this puts them back into the
     single list the card renders. */
  const contacts = useMemo<DispatcherContact[]>(
    () => [partner?.primaryDispatcher, ...(partner?.additionalDispatchers ?? [])].filter(
      (contact): contact is DispatcherContact => Boolean(contact?.name),
    ),
    [partner],
  );
  /* The carrier's own star is its drivers' marks — see `summariseFleet`.
     Its mission figures still count every booking, driver or not. */
  const partnerPerformance = useMemo(() => summariseFleet(partnerBookings), [partnerBookings]);

  /**
   * The carrier's whole paper trail — its licence, its trucks' two papers each,
   * its drivers' one each — read once from the document book.
   *
   * The chase list is capped at eight. A haulier onboarded without any papers
   * owes one row per truck per document, and forty of those is not a list
   * somebody works, it is a wall that hides the two that lapse this week.
   */
  const { data: documentBook } = useDocumentBook();
  const compliance = useMemo(() => {
    const owners: ComplianceOwner[] = [
      { ownerType: 'PARTNER', ownerId: partner?.id ?? '', ownerLabel: partner?.companyLegalName ?? '' },
      ...vehicles.map((vehicle) => ({
        ownerType: 'VEHICLE' as const,
        ownerId: vehicle.id,
        ownerLabel: vehicle.plateNumber,
      })),
      ...drivers.map((driver) => ({
        ownerType: 'DRIVER' as const,
        ownerId: driver.id,
        ownerLabel: driver.fullName,
      })),
    ];
    const findings = complianceFindings(owners, documentBook ?? [], Date.now());
    return {
      tally: tallyFindings(findings),
      chase: findings.filter((f) => f.state !== 'valid').sort(byUrgency).slice(0, 8),
      moreToChase: Math.max(0, findings.filter((f) => f.state !== 'valid').length - 8),
    };
  }, [partner?.id, partner?.companyLegalName, vehicles, drivers, documentBook]);
  const driverPerformance = useMemo(() => {
    const byDriver = new Map<string, BookingRecord[]>();
    for (const booking of partnerBookings) {
      if (!booking.driverId) continue;
      const bucket = byDriver.get(booking.driverId);
      if (bucket) bucket.push(booking);
      else byDriver.set(booking.driverId, [booking]);
    }
    return new Map(
      [...byDriver].map(([driverId, bookings]) => [driverId, summarisePerformance(bookings)]),
    );
  }, [partnerBookings]);


  const filteredMissions = useMemo(() => {
    const needle = shipmentSearch.trim().toLowerCase();
    if (!needle) return partnerMissions;
    return partnerMissions.filter((mission) =>
      [
        mission.id,
        mission.dpcsReference,
        mission.customer.company,
        mission.pickupLocation.name,
        mission.deliveryLocation.name,
        mission.goodsDescription,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [partnerMissions, shipmentSearch]);

  const pagedMissions = usePagedRows(filteredMissions, {
    pageSize: shipmentsPageSize,
    resetKey: shipmentSearch,
  });

  /* Best record first. A roster in insertion order is a list; in rating order
     it answers the question the transporter profile is open for. */
  const rankedDrivers = useMemo(
    () =>
      [...drivers].sort((a, b) => {
        const left = driverPerformance.get(a.id)?.overall ?? -1;
        const right = driverPerformance.get(b.id)?.overall ?? -1;
        return right - left || a.fullName.localeCompare(b.fullName);
      }),
    [drivers, driverPerformance],
  );
  const pagedDrivers = usePagedRows(rankedDrivers, { pageSize: driversPageSize });
  /**
   * The driver whose profile is open.
   *
   * This used to stitch a truck onto them: `/partners/:id` returns drivers and
   * vehicles as two flat lists, and the standing pairing lived on the vehicle
   * side, so the profile had to reach across to find it. There is no standing
   * pairing any more — a driver and a truck meet on a booking — so the driver
   * is simply the driver.
   */
  const openDriver = useMemo(
    () => drivers.find((d) => d.id === openDriverId) ?? null,
    [drivers, openDriverId],
  );
  const pagedVehicles = usePagedRows(vehicles, { pageSize: vehiclesPageSize });

  if (isPartnerLoading || !partner) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-xs text-muted-foreground">
          {isPartnerLoading ? 'Loading transporter…' : 'Transporter not found.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {confirmDialog}
      {/* Toast Notification */}
      {successNotice && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-success/30 bg-success-subtle p-4 text-success-subtle-foreground shadow-sm animate-in fade-in">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-success-subtle-foreground" />
            <span className="type-body-sm font-medium">{successNotice}</span>
          </div>
          <button type="button" onClick={() => setSuccessNotice(null)} className="p-1 rounded-md hover:bg-success-subtle dark:hover:bg-success-subtle transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Header */}
      {/* The carrier's name, not "Transporter Workspace".
       *
       * Every page in the app is a workspace; naming one after the software
       * spends the largest type on screen saying nothing about which haulier
       * you are looking at. The name is the one thing the reader arrived
       * needing, and the reference and country ride underneath it. */}
      <PageHeader
        title={partner.companyLegalName}
        description={`Transporter ${partner.reference ?? partner.id} · ${partner.country}`}
        actions={
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate(ROUTES.partners)} leadingIcon={<ArrowLeft className="h-4 w-4" />} className="rounded-full">
              Back to transporters
            </Button>
            <Button size="sm" onClick={() => setIsEditOpen(true)} leadingIcon={<Pencil className="h-4 w-4" />} className="bg-primary hover:bg-primary-hover text-primary-foreground font-semibold rounded-full">
              Edit profile
            </Button>
          </div>
        }
      />

      {/* Edit Drawer */}
      <Sheet open={isEditOpen} onOpenChange={setIsEditOpen}>
        {/* The house width and the house padding — the same `AddPartnerForm` in
            the same sheet on the Partners list is `sm:max-w-md` with `p-0`, and
            this one was `sm:max-w-2xl` with `p-6 sm:p-8` on top of the form's
            own padding. Two sizes for one form, and the wide one doubled its
            gutters. `sm:max-w-2xl` is for analytics drill-downs and the
            document viewer, not for a two-step profile form. */}
        <SheetContent
          side="right"
          className="flex h-full w-full flex-col gap-0 overflow-hidden border-l border-border bg-background p-0 sm:max-w-md"
        >
          <SheetTitle className="sr-only">Edit Transporter Profile</SheetTitle>
          <SheetDescription className="sr-only">Transporter details and compliance.</SheetDescription>
          <AddPartnerForm
            initialData={{
              companyLegalName: partner.companyLegalName,
              country: partner.country,
              address: partner.address,
              operatingRegions: partner.operatingRegions.join(', '),
              serviceCategories: partner.serviceCategories.join(', '),
              fleetSize: String(partner.fleetSize),
              vehicleTypes: partner.vehicleTypes.join(', '),
              partnerStatus: partner.partnerStatus,
              primaryDispatcherName: partner.primaryDispatcher.name,
              primaryDispatcherTitle: partner.primaryDispatcher.title,
              primaryDispatcherPhone: partner.primaryDispatcher.phone,
              primaryDispatcherEmail: partner.primaryDispatcher.email,
              uploadedDocuments: partner.uploadedDocuments,
            }}
            isEdit={true}
            onSuccess={handleEditSuccess}
            onCancel={() => setIsEditOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* ========================================================================= */}
      {/* SIDEBAR NAVIGATION LAYOUT: LEFT NAVIGATION SIDEBAR & RIGHT CONTENT        */}
      {/* ========================================================================= */}
      {/* A named column, not `col-span-3` of twelve.
          A twelfth-based sidebar is a *percentage*, so at 1180px it collapsed to
          about 200px and everything inside it broke at once: the carrier's name
          truncated to "Ad…", the nav labels each wrapped to two ragged lines and
          "26 / 28" split across a line break. None of those were three bugs —
          they were one column that had no floor. It is 260px now and gives that
          width back to the content when there is room, and the whole thing
          stacks below `lg` as before. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:[grid-template-columns:minmax(260px,300px)_minmax(0,1fr)]">

        {/* ----------------------------------------------------------------- */}
        {/* LEFT SIDEBAR: BRAND CARD & SECTION NAVIGATION TABS                */}
        {/* ----------------------------------------------------------------- */}
        <div className="min-w-0 space-y-4 lg:sticky lg:top-6">
          {/* Identity Summary Card */}
          <Card className="p-5 border border-border bg-card rounded-lg shadow-2xs space-y-4">
            {/* Logo above the name, not beside it. Side by side, a 56px mark
                and its gap ate a third of the card and left the name about
                85px — enough for "Ad…". Stacked, the name gets the whole
                width and wraps instead of being cut. */}
            <div className="space-y-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/80 bg-surface-sunken shadow-2xs">
                {partner.logoUrl ? (
                  <img src={partner.logoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Truck className="h-7 w-7 text-primary" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-start gap-1.5">
                  <h3 className="min-w-0 text-lg font-extrabold leading-tight text-foreground [overflow-wrap:anywhere]">
                    {partner.companyLegalName}
                  </h3>
                  <span className="mt-0.5 shrink-0">
                    <VerificationBadge state={partner.partnerStatus === 'Active' ? 'verified' : 'unverified'} size="lg" />
                  </span>
                </div>
                <div className="mt-1.5">
                  <Badge intent={partner.partnerStatus === 'Active' ? 'success' : 'warning'} size="sm">
                    {partner.partnerStatus} Transporter
                  </Badge>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-border/60 space-y-2 text-xs">
              <div className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="min-w-0 leading-snug">{partner.address}, {partner.country}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Truck className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>{vehicles.length} vehicles · {drivers.length} drivers</span>
              </div>
            </div>
          </Card>

          {/* Navigation Sidebar Controls */}
          <Card className="p-2 border border-border/80 bg-card rounded-lg shadow-2xs space-y-1">
            <span className="px-3 pt-2 pb-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
              View Navigation
            </span>

            {([
              { key: 'overview' as const, label: 'Overview', icon: Handshake },
              { key: 'shipments' as const, label: 'Shipments', icon: Package },
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === key
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 text-left leading-snug">{label}</span>
              </button>
            ))}
          </Card>

        </div>

        {/* RIGHT MAIN PANEL */}
        {/* Everything in here is measured against THIS column, not the
            window. The panel sits beside a 260–300px sidebar, so at a 1024px
            viewport it is only ~660px wide — and every `lg:` inside it was
            firing as though it had the whole screen. That is how a four-card
            strip ended up at ~150px a card: "8 / 13" broke across two lines
            and "FDJ 9,801,600" ran off the right edge. */}
        <div className="@container/panel min-w-0 space-y-6">
          {activeTab === 'overview' && (
            <div className="space-y-5 animate-in fade-in">
              {/* ── WHO TO CALL ──
               *
               * First on the page, because it is the reason most people open a
               * carrier: something has gone wrong with a container and they
               * need a human. It used to be a strip at the very bottom, under a
               * driver roster and a rate table, holding exactly one person.
               *
               * A haulier is not one person. There is a dispatcher for the day
               * shift and an owner who answers at night, and the record only
               * ever held whichever of them was typed in first — so the second
               * number lived in somebody's phone. The Contact table has always
               * been one-to-many; nothing in the app had ever added a second
               * row to it. */}
              <ContactsCard
                partnerId={partner.id}
                contacts={contacts}
                onChanged={(message) => showSuccess(message)}
              />

              {/* ── HOW THEY RUN ──
               *
               * The rating trend chart is gone. It drew six months of a single
               * line for a carrier whose whole record is often three missions —
               * a shape with nothing in it, taking half the card, next to the
               * three axis bars that were actually carrying the answer. */}
              <Card className="space-y-4 rounded-lg border border-border/80 bg-card p-4 shadow-2xs @[40rem]/panel:p-6">
                <div className="flex items-center gap-2 border-b border-border/60 pb-3">
                  <Star className="h-4.5 w-4.5 fill-warning text-warning" />
                  <h4 className="type-h4 font-semibold text-foreground">Performance</h4>
                </div>
                <PerformancePanel summary={partnerPerformance} />
              </Card>

              {/* ── PAPERS ──
               *
               * Four figures and a way through to them. The chase list that was
               * here — one row per lapsing document, capped at eight — is
               * Fleetin Drive's whole job, and doing it twice meant two places
               * to fix a licence and two places to be out of date. This says
               * whether there is a problem; the Drive is where it is worked. */}
              <Card className="space-y-4 rounded-lg border border-border/80 bg-card p-4 shadow-2xs @[40rem]/panel:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4.5 w-4.5 text-primary" />
                    <h4 className="type-h4 font-semibold text-foreground">Documents</h4>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(ROUTES.documents)}
                    trailingIcon={<ExternalLink className="h-3.5 w-3.5" />}
                    className="rounded-full text-xs"
                  >
                    Open in Fleetin Drive
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 @[34rem]/panel:grid-cols-4">
                  <ComplianceFigure label="Held" value={compliance.tally.valid} tone="text-success" />
                  <ComplianceFigure
                    label="Expiring"
                    value={compliance.tally.expiring}
                    tone="text-warning-subtle-foreground"
                  />
                  <ComplianceFigure
                    label="Expired"
                    value={compliance.tally.expired}
                    tone="text-destructive"
                  />
                  <ComplianceFigure
                    label="Missing"
                    value={compliance.tally.missing}
                    tone="text-foreground"
                  />
                </div>
              </Card>

              {/* ── THE FLEET ──
               *
               * Plate, type, trips. The grid of bordered tiles this replaced
               * gave each truck a capacity line, a status pill, a verification
               * tick and a delete button in a 150px card, and forty of them was
               * most of the page — for a list whose only question is "what have
               * they got and how much has it run". The truck's own sheet holds
               * the rest, one click away on the row. */}
              <MinimalRoster
                title="Vehicles"
                icon={Truck}
                count={vehicles.length}
                action={
                  <Button
                    size="sm"
                    onClick={() => setShowAddVehicle((prev) => !prev)}
                    leadingIcon={<Plus className="h-3.5 w-3.5" />}
                    className="shrink-0 rounded-full text-xs"
                  >
                    {showAddVehicle ? 'Cancel' : 'Add vehicle'}
                  </Button>
                }
              >
                {showAddVehicle && (
                  <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3 animate-in fade-in">
                    <div className="grid grid-cols-1 gap-2.5 @[28rem]/panel:grid-cols-3">
                      <Input
                        placeholder="Plate (e.g. DJ-ABJ-9922)"
                        value={newVehicle.plateNumber || ''}
                        onChange={(e) => setNewVehicle((p) => ({ ...p, plateNumber: e.target.value }))}
                      />
                      <Select
                        value={newVehicle.truckType || '40ft Container'}
                        options={TRUCK_TYPE_OPTIONS}
                        onChange={(e) => setNewVehicle((p) => ({ ...p, truckType: e.target.value as TruckType }))}
                      />
                      <Input
                        placeholder="Capacity (e.g. 28 tons)"
                        value={newVehicle.containerCapacity || ''}
                        onChange={(e) => setNewVehicle((p) => ({ ...p, containerCapacity: e.target.value }))}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm" onClick={handleAddVehicle} className="rounded-full px-4 text-xs">
                        Save vehicle
                      </Button>
                    </div>
                  </div>
                )}

                {pagedVehicles.rows.map((veh) => (
                  <RosterRow
                    key={veh.id}
                    mono
                    name={veh.plateNumber}
                    meta={veh.truckType}
                    verified={isVehicleVerified(veh)}
                    figure={veh.trips ?? 0}
                    figureLabel={(veh.trips ?? 0) === 1 ? 'trip' : 'trips'}
                    onOpen={() => navigate(`${ROUTES.vehicles}?vehicle=${veh.id}`)}
                    onRemove={() => handleDeleteVehicle(veh.id)}
                    removeLabel={`Remove ${veh.plateNumber} from this transporter`}
                  />
                ))}

                {vehicles.length > 0 && (
                  <TablePager
                    paged={pagedVehicles}
                    noun="vehicles"
                    pageSize={vehiclesPageSize}
                    onPageSizeChange={setVehiclesPageSize}
                    pageSizeOptions={[5, 10, 25, 50]}
                  />
                )}
              </MinimalRoster>

              {/* ── THE CREW ──
               *
               * Same row, same three facts. The "On Time" column beside every
               * driver read "—" for seven of eight of them, because on-time is
               * computed from delivery windows most bookings never carried; a
               * column that is empty on almost every row is a column teaching
               * the reader to ignore that part of the row. */}
              <MinimalRoster
                title="Drivers"
                icon={Users}
                count={drivers.length}
                action={
                  <Button
                    size="sm"
                    onClick={() => setShowAddDriver((prev) => !prev)}
                    leadingIcon={<Plus className="h-3.5 w-3.5" />}
                    className="shrink-0 rounded-full text-xs"
                  >
                    {showAddDriver ? 'Cancel' : 'Add driver'}
                  </Button>
                }
              >
                {showAddDriver && (
                  <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3 animate-in fade-in">
                    <div className="grid grid-cols-1 gap-2.5 @[28rem]/panel:grid-cols-3">
                      <Input
                        placeholder="Full name"
                        value={newDriver.fullName || ''}
                        onChange={(e) => setNewDriver((p) => ({ ...p, fullName: e.target.value }))}
                      />
                      <Input
                        placeholder="Licence number"
                        value={newDriver.drivingLicenseNumber || ''}
                        onChange={(e) => setNewDriver((p) => ({ ...p, drivingLicenseNumber: e.target.value }))}
                      />
                      <Input
                        placeholder="Phone"
                        value={newDriver.phone || ''}
                        onChange={(e) => setNewDriver((p) => ({ ...p, phone: e.target.value }))}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm" onClick={handleAddDriver} className="rounded-full px-4 text-xs">
                        Save driver
                      </Button>
                    </div>
                  </div>
                )}

                {pagedDrivers.rows.map((drv) => {
                  const summary = driverPerformance.get(drv.id) ?? UNRATED;
                  return (
                    <RosterRow
                      key={drv.id}
                      name={drv.fullName}
                      meta={drv.reference}
                      verified={isDriverVerified(drv)}
                      figure={summary.missions}
                      figureLabel={summary.missions === 1 ? 'mission' : 'missions'}
                      stars={summary.overall ?? undefined}
                      onOpen={() => setOpenDriverId(drv.id)}
                      onRemove={() => handleDeleteDriver(drv.id)}
                      removeLabel={`Remove ${drv.fullName} from this transporter`}
                    />
                  );
                })}

                {drivers.length > 0 && (
                  <TablePager
                    paged={pagedDrivers}
                    noun="drivers"
                    pageSize={driversPageSize}
                    onPageSizeChange={setDriversPageSize}
                    pageSizeOptions={[5, 10, 25, 50]}
                  />
                )}
              </MinimalRoster>
            </div>
          )}


          {/* =============================================================== */}
          {/* TAB 3: SHIPMENTS & CARGO                                        */}
          {/* =============================================================== */}
          {/* =============================================================== */}
          {/* SHIPMENTS — whole jobs, in the app's own shipment row           */}
          {/* =============================================================== */}
          {activeTab === 'shipments' && (
            <div className="space-y-4 animate-in fade-in">
              {/* ── ONE ROW PER JOB, NOT PER CONTAINER ──
               *
               * This listed BOOKINGS. A twenty-container shipment split across
               * two carriers appeared as twelve near-identical rows, each with
               * the same route and the same shipper, and reading it meant
               * mentally grouping them back into the jobs they came from.
               *
               * A shipment is the job; which of its containers this carrier
               * ran is a question the shipment's own page answers, and that is
               * one click away on the row. So the list is the shipments this
               * carrier has worked — matched on its BOOKINGS, not on the
               * shipment's creation-time transporter field, because about a
               * fifth of jobs are split and the field names only the first.
               *
               * `MissionRowCard` is the row the Operations list uses. Same
               * card, same corner tab, same progress figure: a shipment should
               * not look like a different kind of thing because of which page
               * it is being read on. */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="type-h4 flex items-center gap-2 font-semibold text-foreground">
                  <Package className="h-4.5 w-4.5 text-primary" />
                  Shipments
                  <span className="text-xs font-medium text-muted-foreground">
                    {partnerMissions.length}
                  </span>
                </h4>
                <Input
                  value={shipmentSearch}
                  onChange={(e) => setShipmentSearch(e.target.value)}
                  placeholder="Search shipments…"
                  leadingIcon={<Search className="size-4" />}
                  isClearable
                  onClear={() => setShipmentSearch('')}
                  className="w-full sm:w-64"
                />
              </div>

              <div className="space-y-3.5">
                {pagedMissions.rows.map((mission) => (
                  <MissionRowCard
                    key={mission.id}
                    mission={mission}
                    onClick={() =>
                      navigate(buildPath(ROUTES.shipmentOverview, { id: mission.id }))
                    }
                  />
                ))}

                {pagedMissions.rows.length === 0 && (
                  <div className="rounded-card-nested border border-border bg-card px-3 py-12 text-center text-sm text-muted-foreground">
                    {shipmentSearch.trim()
                      ? 'No shipment matches that search.'
                      : 'This transporter has not run a shipment yet.'}
                  </div>
                )}
              </div>

              {filteredMissions.length > 0 && (
                <TablePager
                  paged={pagedMissions}
                  noun="shipments"
                  pageSize={shipmentsPageSize}
                  onPageSizeChange={setShipmentsPageSize}
                  pageSizeOptions={[12, 24, 48, 96]}
                />
              )}
            </div>
          )}

        </div>
      </div>

      {/* No `transporter` block: the reader is already standing in that
          transporter's dossier, and a card pointing back at this page would be
          a link to nowhere. The full record — documents, editing — is still one
          click away in the footer. */}
      <DriverProfileSheet
        driver={openDriver}
        summary={(openDriver && driverPerformance.get(openDriver.id)) ?? UNRATED}
        onClose={() => setOpenDriverId(null)}
        footer={
          openDriver ? (
            <div className="pt-2">
              <Button
                variant="outline"
                onClick={() => navigate(`${ROUTES.drivers}?driver=${openDriver.id}`)}
                leadingIcon={<ExternalLink className="h-4 w-4" />}
                className="w-full rounded-lg py-2.5 text-xs font-semibold"
              >
                Open full record
              </Button>
            </div>
          ) : null
        }
      />

      <DocumentViewerModal open={Boolean(viewingDoc)} onOpenChange={(open) => !open && setViewingDoc(null)} document={viewingDoc} />
    </div>
  );
}

export default PartnerDetailPage;
