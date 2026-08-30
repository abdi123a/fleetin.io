import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  FileText,
  MapPin,
  Pencil,
  Trash2,
  Truck,
  Upload,
  X,
  Phone,
  Mail,
  User,
  Compass,
  Plus,
  Package,
  Search,
  DollarSign,
} from '@/design-system/icons';
import { DocumentViewerModal, type DocumentToView } from '@/components/DocumentViewerModal';
import {
  AlertTriangle,
  BadgeCheck,
  Star,
  Users,
} from 'lucide-react';
import { PageHeader, TablePager, usePagedRows } from '@/components';
import { IconChip, useConfirm } from '@/design-system';
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
  ShipmentCard,
  VerificationBadge,
} from '@/design-system';
import { ROUTES, buildPath } from '@/config/routes';
import { isDriverVerified, isVehicleVerified } from '@/utils';
import {
  type PartnerDriver,
  type PartnerVehicle,
  type PartnerDocument,
  type PartnerDocumentCategory,
  type OperationalStatus,
  type TruckType,
  computeComplianceScore,
  deriveComplianceAlerts,
} from '@/types/partner';
import { AddPartnerForm, type PartnerFormData } from './AddPartnerForm';
import {
  useAddPricingTier,
  usePartner,
  useRemovePricingTier,
  useUpdatePartner,
  useUploadPartnerLogo,
} from '@/features/partners/api/queries';
import { useCreateDriver, useDeleteDriver } from '@/features/drivers/api/queries';
import { useCreateVehicle, useDeleteVehicle } from '@/features/vehicles/api/queries';
import {
  useDeleteDocument,
  useDocuments,
  useUploadDocument,
} from '@/features/documents/api/queries';
import { downloadDocument, toDisplayDocument } from '@/features/documents/api/documentsService';
import { useBreadcrumbLabel } from '@/hooks/useBreadcrumbLabel';
import { useBookings } from '@/features/bookings/api/queries';
import type { BookingRecord } from '@/features/bookings/api/bookingsService';
import { DriverRatingRow, PerformancePanel, RatingTrendChart } from '@/components/performance';
import { DriverProfileSheet } from '@/components/drivers';
import { UNRATED, fleetRatingTrend, summariseFleet, summarisePerformance } from '@/lib/rating';
import { displayShipmentStatus, statusIntentOf } from '@/lib/shipmentStatus';
import { containerStateOf } from '@/lib/containerState';

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkspaceTab = 'overview' | 'fleet_compliance' | 'shipments';

const DOC_CATEGORY_OPTIONS: { value: PartnerDocumentCategory; label: string }[] = [
  { value: 'Grey Card', label: 'Grey Card (Carte Grise)' },
  { value: 'Vehicle Registration', label: 'Vehicle Registration' },
  { value: 'Contract', label: 'Contract' },
  { value: 'Driver License', label: 'Driver License' },
  { value: 'Other', label: 'Other' },
];

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

const STATUS_OPTIONS: { value: OperationalStatus; label: string }[] = [
  { value: 'Available', label: 'Available' },
  { value: 'In Transit', label: 'In Transit' },
  { value: 'Under Maintenance', label: 'Under Maintenance' },
  { value: 'Out of Service', label: 'Out of Service' },
];

/**
 * This tab's own filter buckets. Deliberately *not* a fifth status
 * vocabulary: the words shown on a row come from `displayShipmentStatus`
 * like everywhere else, and these are only the coarse groups the filter
 * strip offers. The version this replaced invented `REGISTERED`/`IN_TRANSIT`
 * labels from the *shipment's* status, which is why a transporter with five
 * delivered containers read "Delivered 0".
 */
type BookingBucket = 'PAID' | 'DELIVERED' | 'IN_TRANSIT' | 'OPEN';

function bookingBucket(booking: BookingRecord): BookingBucket {
  if (booking.status === 'Completed' && booking.shipment?.payoutReleasedAt) return 'PAID';
  if (['Completed', 'POD Submitted', 'Empty Ready'].includes(booking.status)) return 'DELIVERED';
  if (['Driver Assigned', 'Heading to Pickup', 'At Pickup', 'Loading', 'Loaded', 'En Route', 'Arrived', 'Unloading'].includes(booking.status)) return 'IN_TRANSIT';
  return 'OPEN';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusPill({ status }: { status: OperationalStatus }) {
  switch (status) {
    case 'Available':
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-success-subtle text-success-subtle-foreground border border-success/20"><span className="h-1.5 w-1.5 rounded-full bg-success" />Available</span>;
    case 'In Transit':
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-info-subtle text-info-subtle-foreground border border-info/20"><span className="h-1.5 w-1.5 rounded-full bg-info" />In Transit</span>;
    case 'Under Maintenance':
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-warning-subtle text-warning-subtle-foreground border border-warning/20"><span className="h-1.5 w-1.5 rounded-full bg-warning" />Maintenance</span>;
    case 'Out of Service':
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-destructive-subtle text-destructive-subtle-foreground border border-destructive/20"><span className="h-1.5 w-1.5 rounded-full bg-destructive" />Out of Service</span>;
  }
}

// ─── Page Component ───────────────────────────────────────────────────────────

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
  const addPricingTierMutation = useAddPricingTier();
  const removePricingTierMutation = useRemovePricingTier();

  const { data: rawDocuments = [] } = useDocuments('PARTNER', partnerId);
  const documents = useMemo(() => rawDocuments.map(toDisplayDocument) as PartnerDocument[], [rawDocuments]);
  const uploadDocumentMutation = useUploadDocument('PARTNER', partnerId);
  const deleteDocumentMutation = useDeleteDocument('PARTNER', partnerId);

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
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [newDocFile, setNewDocFile] = useState<File | null>(null);
  const [newDocCategory, setNewDocCategory] = useState<PartnerDocumentCategory>('Grey Card');
  const [viewingDoc, setViewingDoc] = useState<DocumentToView | null>(null);

  // ── Pricing Rate form ──
  const [showAddPrice, setShowAddPrice] = useState(false);
  const [newRoute, setNewRoute] = useState('');
  const [newPriceVehicle, setNewPriceVehicle] = useState('40ft Container');
  const [newBasePrice, setNewBasePrice] = useState('');

  // ── Shipments search & filter ──
  /* Each dossier tab pages independently — a partner with sixty trucks should
     not make the fleet tab a scroll, and its shipment history even less so. */
  const [driversPageSize, setDriversPageSize] = useState(12);
  const [vehiclesPageSize, setVehiclesPageSize] = useState(12);
  const [documentsPageSize, setDocumentsPageSize] = useState(12);
  const [shipmentsPageSize, setShipmentsPageSize] = useState(12);

  const [shipmentSearch, setShipmentSearch] = useState('');
  const [shipmentFilter, setShipmentFilter] = useState<'ALL' | 'IN_TRANSIT' | 'DELIVERED' | 'REGISTERED'>('ALL');

  const showSuccess = (msg: string) => {
    setSuccessNotice(msg);
    setTimeout(() => setSuccessNotice(null), 5000);
  };

  const handleAddPriceRate = () => {
    if (!newRoute.trim() || !newBasePrice || !partner) return;
    const route = newRoute.trim();
    addPricingTierMutation.mutate(
      { partnerId: partner.id, payload: { route, vehicleType: newPriceVehicle, basePrice: parseFloat(newBasePrice) || 0, currency: 'USD' } },
      { onSuccess: () => showSuccess(`Rate tier "${route}" added.`) },
    );
    setNewRoute('');
    setNewBasePrice('');
    setShowAddPrice(false);
  };

  const { confirm, confirmDialog } = useConfirm();

  const handleDeletePriceRate = async (tierId: string) => {
    if (!partner) return;
    const ok = await confirm({
      title: 'Remove this rate tier?',
      description: 'New bookings will no longer be priced from it. Bookings already priced keep their rate.',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    removePricingTierMutation.mutate(
      { partnerId: partner.id, tierId },
      { onSuccess: () => showSuccess('Rate tier removed.') },
    );
  };

  const complianceScore = partner ? computeComplianceScore({ ...partner, drivers, vehicles, uploadedDocuments: documents }) : 0;
  const complianceAlerts = partner ? deriveComplianceAlerts({ ...partner, drivers, vehicles, uploadedDocuments: documents }) : [];

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
          licenseExpiry: newDriver.licenseExpiry || '',
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

  const handleAddDoc = () => {
    if (!newDocFile) return;
    uploadDocumentMutation.mutate(
      { category: newDocCategory, file: newDocFile },
      { onSuccess: () => showSuccess('Document uploaded.') },
    );
    setNewDocFile(null);
    setShowAddDoc(false);
  };

  const handleDeleteDoc = async (docId: string) => {
    const ok = await confirm({
      title: 'Delete this document?',
      description: 'The file will be permanently removed from the vault.',
    });
    if (!ok) return;
    deleteDocumentMutation.mutate(docId, { onSuccess: () => showSuccess('Document removed.') });
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
  const partnerShipments = useMemo(
    () =>
      (bookingPage?.items ?? [])
        .filter((b) => b.status !== 'Cancelled' && b.status !== 'Failed')
        .map((b) => {
          const scheduled = b.scheduledPickupTime ?? b.shipment?.scheduledPickupTime ?? '';
          const cost = b.transporterCostMinorUnits ? Number(b.transporterCostMinorUnits) : 0;
          return {
            id: b.reference,
            shipmentReference: b.shipment?.reference ?? '',
            containerNumber: b.containerNumber ?? '',
            origin: b.shipment?.pickupLocationName ?? '—',
            destination: b.shipment?.deliveryLocationName ?? '—',
            shipperCompany: b.shipment?.customerCompany ?? 'Unknown shipper',
            shipperContact: b.shipment?.customerName ?? '',
            rawStatus: b.status,
            bucket: bookingBucket(b),
            date: scheduled.split('T')[0] ?? scheduled,
            time: (scheduled.split('T')[1] ?? '').slice(0, 5),
            // What this transporter earns on this container — their own cost
            // line, not the shipment-level aggregate that sums every carrier.
            amount: cost ? `FDJ ${cost.toLocaleString()}` : 'Not priced',
            rateFDJ: cost,
            driverName: b.driver?.fullName ?? '',
            goodsType: b.cargoType,
          };
        }),
    [bookingPage],
  );

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
  /* The carrier's own star is its drivers' marks — see `summariseFleet`.
     Its mission figures still count every booking, driver or not. */
  const partnerPerformance = useMemo(() => summariseFleet(partnerBookings), [partnerBookings]);
  const partnerTrend = useMemo(() => fleetRatingTrend(partnerBookings), [partnerBookings]);
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

  const shipmentStats = useMemo(() => {
    const inTransit = partnerShipments.filter((s) => s.bucket === 'IN_TRANSIT').length;
    const delivered = partnerShipments.filter((s) => s.bucket === 'DELIVERED' || s.bucket === 'PAID').length;
    const totalFdj = partnerShipments.reduce((sum, s) => sum + s.rateFDJ, 0);
    return { total: partnerShipments.length, inTransit, delivered, totalFdj };
  }, [partnerShipments]);

  const filteredShipments = partnerShipments.filter((shp) => {
    const needle = shipmentSearch.toLowerCase();
    const matchesSearch =
      shp.id.toLowerCase().includes(needle) ||
      shp.shipmentReference.toLowerCase().includes(needle) ||
      shp.containerNumber.toLowerCase().includes(needle) ||
      shp.shipperCompany.toLowerCase().includes(needle) ||
      shp.destination.toLowerCase().includes(needle) ||
      shp.origin.toLowerCase().includes(needle);

    const matchesFilter =
      shipmentFilter === 'ALL' ||
      (shipmentFilter === 'IN_TRANSIT' && shp.bucket === 'IN_TRANSIT') ||
      (shipmentFilter === 'DELIVERED' && (shp.bucket === 'DELIVERED' || shp.bucket === 'PAID')) ||
      (shipmentFilter === 'REGISTERED' && shp.bucket === 'OPEN');

    return matchesSearch && matchesFilter;
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
  const pagedDocuments = usePagedRows(documents, { pageSize: documentsPageSize });
  const pagedShipments = usePagedRows(filteredShipments, {
    pageSize: shipmentsPageSize,
    resetKey: `${shipmentFilter}|${shipmentSearch}`,
  });

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
      <PageHeader
        title="Transporter Workspace"
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
                <span>{partner.fleetSize} Fleet Vehicles</span>
              </div>
            </div>
          </Card>

          {/* Navigation Sidebar Controls */}
          <Card className="p-2 border border-border/80 bg-card rounded-lg shadow-2xs space-y-1">
            <span className="px-3 pt-2 pb-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
              View Navigation
            </span>

            {/* Overview & Drivers Tab Button */}
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'overview'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Building2 className="h-4 w-4 shrink-0" />
              <span>Overview & Drivers</span>
            </button>

            {/* Fleet & Compliance Tab Button */}
            <button
              type="button"
              onClick={() => setActiveTab('fleet_compliance')}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'fleet_compliance'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Truck className="h-4 w-4 shrink-0" />
              <span className="min-w-0 text-left leading-snug">Fleet &amp; Compliance</span>
            </button>

            {/* Shipments & Cargo Tab Button */}
            <button
              type="button"
              onClick={() => setActiveTab('shipments')}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'shipments'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Package className="h-4 w-4 shrink-0" />
              <span className="min-w-0 text-left leading-snug">Shipments &amp; Cargo</span>
            </button>
          </Card>

        </div>

        {/* RIGHT MAIN PANEL */}
        <div className="min-w-0 space-y-6">
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-in fade-in">
              {/* Performance — the carrier's own record, before its capabilities. */}
              <Card className="p-4 sm:p-6 border border-border/80 bg-card rounded-lg shadow-2xs space-y-5">
                <div className="border-b border-border/60 pb-3">
                  <h4 className="type-h4 font-semibold text-foreground flex items-center gap-2">
                    <Star className="h-4.5 w-4.5 text-warning fill-warning" />
                    Performance
                  </h4>
                </div>

                {/* auto-fit, not a viewport breakpoint: this card sits in a
                    column the sidebar narrows, so "is there room for two" is a
                    question about the container, not the window. When there is
                    not, the trend drops below — and keeps its own heading, so
                    a stacked chart never reads as a tail of the bars above it. */}
                <div className="grid gap-x-8 gap-y-7 [grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr))]">
                  <PerformancePanel summary={partnerPerformance} />
                  {partnerPerformance.rated && (
                    <section className="flex min-w-0 flex-col justify-center gap-3">
                      <h5 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Rating Trend
                      </h5>
                      <RatingTrendChart points={partnerTrend} />
                    </section>
                  )}
                </div>
              </Card>

              {/* Card 1: Fleet Capabilities */}
              <Card className="p-4 sm:p-6 border border-border/80 bg-card rounded-lg shadow-2xs space-y-4">
                <div className="border-b border-border/60 pb-3">
                  <h4 className="type-h4 font-semibold text-foreground flex items-center gap-2">
                    <Compass className="h-4.5 w-4.5 text-primary" />
                    Fleet Capabilities
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
                  <div>
                    <span className="text-muted-foreground font-medium block mb-1.5">Operating Cross-Border Regions</span>
                    <div className="flex flex-wrap gap-1.5">
                      {partner.operatingRegions.map((region) => (
                        <Badge key={region} intent="default" size="sm" className="bg-muted/40 border border-border">
                          {region}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="text-muted-foreground font-medium block mb-1.5">Service Categories</span>
                    <div className="flex flex-wrap gap-1.5">
                      {partner.serviceCategories.map((cat) => (
                        <Badge key={cat} intent="accent" size="sm">
                          {cat}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="text-muted-foreground font-medium block mb-1.5">Vehicle Types</span>
                    <div className="flex flex-wrap gap-1.5">
                      {partner.vehicleTypes.map((vt) => (
                        <Badge key={vt} intent="primary" size="sm">
                          {vt}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>

              {/* Card 2 (Top 2): Contracted Freight Rates & Pricing */}
              <Card className="p-4 sm:p-6 border border-border/80 bg-card rounded-lg shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                  <h4 className="type-h4 font-semibold text-foreground flex items-center gap-2">
                    <DollarSign className="h-4.5 w-4.5 text-primary" />
                    Contracted Rates
                  </h4>
                  <Button
                    size="sm"
                    onClick={() => setShowAddPrice((prev) => !prev)}
                    leadingIcon={<Plus className="h-3.5 w-3.5" />}
                    className="bg-primary text-primary-foreground text-xs font-semibold rounded-full shrink-0"
                  >
                    {showAddPrice ? 'Cancel' : 'Add rate'}
                  </Button>
                </div>

                {/* Add Price Rate Inline Subform */}
                {showAddPrice && (
                  <div className="p-3.5 rounded-lg border border-primary/30 bg-primary/5 space-y-2.5 animate-in fade-in">
                    <h5 className="text-xs font-bold text-primary">New Route Rate</h5>
                    <div className="space-y-2 text-xs">
                      <Input
                        placeholder="Route (e.g. Djibouti → Dire Dawa)"
                        value={newRoute}
                        onChange={(e) => setNewRoute(e.target.value)}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          placeholder="Base Price ($)"
                          type="number"
                          value={newBasePrice}
                          onChange={(e) => setNewBasePrice(e.target.value)}
                        />
                        <Select
                          value={newPriceVehicle}
                          options={TRUCK_TYPE_OPTIONS}
                          onChange={(e) => setNewPriceVehicle(e.target.value)}
                        />
                      </div>
                      <div className="flex justify-end pt-1">
                        <Button size="sm" onClick={handleAddPriceRate} className="bg-primary text-primary-foreground text-xs rounded-full px-4">
                          Save rate
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* `md:grid-cols-3` asked the *window* whether three tiles fit,
                    when the question was about this card — which the sidebar
                    leaves around 590px, so each tile got ~180px and every route
                    name broke across four lines. auto-fit asks the container,
                    and the tile stacks its price under the route instead of
                    fighting it for the same row. */}
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr))]">
                  {partner.pricingGrid && partner.pricingGrid.length > 0 ? (
                    partner.pricingGrid.map((tier) => (
                      <div
                        key={tier.id}
                        className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-3.5 text-xs transition-colors hover:border-primary/40"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="block font-bold leading-snug text-foreground">{tier.route}</span>
                            <span className="text-[11px] text-muted-foreground">{tier.vehicleType}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeletePriceRate(tier.id)}
                            className="-m-1 shrink-0 rounded-sm p-1 text-muted-foreground transition-colors hover:text-destructive"
                            aria-label={`Delete the ${tier.vehicleType} rate for ${tier.route}`}
                            title="Delete rate"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <span className="whitespace-nowrap border-t border-border/50 pt-2 font-mono text-sm font-black text-foreground">
                          ${tier.basePrice.toLocaleString()} {tier.currency}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="col-span-full text-xs text-muted-foreground">No rate tiers yet.</p>
                  )}
                </div>
              </Card>

              {/* Drivers Roster Card */}
              <Card className="p-4 sm:p-6 border border-border/80 bg-card rounded-lg shadow-2xs space-y-5">
                <div className="flex items-center justify-between flex-wrap gap-3 border-b border-border/60 pb-3">
                  <div>
                    <h4 className="type-h4 font-semibold text-foreground flex items-center gap-2">
                      <Users className="h-4.5 w-4.5 text-primary" />
                      Drivers ({drivers.length})
                    </h4>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setShowAddDriver((prev) => !prev)}
                    leadingIcon={<Plus className="h-4 w-4" />}
                    className="bg-primary text-primary-foreground text-xs font-semibold rounded-full shrink-0"
                  >
                    {showAddDriver ? 'Cancel' : 'Add driver'}
                  </Button>
                </div>

                {/* Add Driver Inline Form */}
                {showAddDriver && (
                  <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3 animate-in fade-in">
                    <h5 className="text-xs font-bold text-primary">New Driver</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      <Input
                        placeholder="Full Name (e.g. Abdi Yusuf)"
                        value={newDriver.fullName || ''}
                        onChange={(e) => setNewDriver((p) => ({ ...p, fullName: e.target.value }))}
                      />
                      <Input
                        placeholder="Driving License No."
                        value={newDriver.drivingLicenseNumber || ''}
                        onChange={(e) => setNewDriver((p) => ({ ...p, drivingLicenseNumber: e.target.value }))}
                      />
                      <Input
                        placeholder="Phone Number"
                        value={newDriver.phone || ''}
                        onChange={(e) => setNewDriver((p) => ({ ...p, phone: e.target.value }))}
                      />
                      <Input
                        type="date"
                        placeholder="License Expiry"
                        value={newDriver.licenseExpiry || ''}
                        onChange={(e) => setNewDriver((p) => ({ ...p, licenseExpiry: e.target.value }))}
                      />
                      <Select
                        value={newDriver.status || 'Available'}
                        options={STATUS_OPTIONS}
                        onChange={(e) => setNewDriver((p) => ({ ...p, status: e.target.value as OperationalStatus }))}
                      />
                    </div>
                    <div className="flex justify-end pt-1">
                      <Button size="sm" onClick={handleAddDriver} className="bg-primary text-primary-foreground font-semibold text-xs rounded-full px-4">
                        Save driver
                      </Button>
                    </div>
                  </div>
                )}

                {/* Drivers Roster — best record first, each row opening that
                    driver's own profile. License, documents and vehicle live
                    there; here the row answers only "how do they run". */}
                <div className="space-y-2">
                  {pagedDrivers.rows.map((drv) => (
                    <div key={drv.id} className="flex items-center gap-2">
                      <DriverRatingRow
                        className="min-w-0 flex-1"
                        name={drv.fullName}
                        meta={[
                          drv.reference,
                          drv.trips ? `${drv.trips} ${drv.trips === 1 ? 'trip' : 'trips'}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        photoUrl={drv.profilePictureUrl}
                        badge={<VerificationBadge state={isDriverVerified(drv) ? 'verified' : 'unverified'} size="sm" />}
                        status={<StatusPill status={drv.status} />}
                        summary={driverPerformance.get(drv.id) ?? UNRATED}
                        onOpen={() => setOpenDriverId(drv.id)}
                      />
                      <button
                        type="button"
                        onClick={() => handleDeleteDriver(drv.id)}
                        className="p-1.5 rounded-sm text-muted-foreground hover:text-destructive transition-colors shrink-0"
                        /* `title` alone is the weakest accessible name there is —
                           it never reaches touch, and screen readers treat it as
                           a last resort. The name says *which* driver, because
                           seven identical "Remove driver" buttons in a list is
                           the same as none. */
                        aria-label={`Remove ${drv.fullName} from this transporter`}
                        title={`Remove ${drv.fullName}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {drivers.length > 0 ? (
                  <TablePager
                    paged={pagedDrivers}
                    noun="drivers"
                    pageSize={driversPageSize}
                    onPageSizeChange={setDriversPageSize}
                    pageSizeOptions={[12, 24, 48, 96]}
                  />
                ) : null}
              </Card>

              {/* Compact Primary Dispatcher Contact Card (Bottom) */}
              <Card className="p-4 border border-border/80 bg-card rounded-lg shadow-2xs space-y-2">
                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-primary" />
                    Primary Dispatcher Contact
                  </span>
                  <span className="text-xs font-bold text-foreground">
                    {partner.primaryDispatcher.name} <span className="text-[11px] font-normal text-muted-foreground">({partner.primaryDispatcher.title})</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs flex-wrap gap-3">
                  <div className="flex items-center gap-2 text-foreground font-mono font-medium">
                    <Phone className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>{partner.primaryDispatcher.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground truncate">
                    <Mail className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="truncate">{partner.primaryDispatcher.email}</span>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* =============================================================== */}
          {/* TAB 2: FLEET & COMPLIANCE (COMBINED VEHICLES, DOCS & SCORE)     */}
          {/* =============================================================== */}
          {activeTab === 'fleet_compliance' && (
            <div className="space-y-6 animate-in fade-in">
              
              {/* Professional Color-Branded Compliance & Fleet Metrics Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Card 1: Compliance Health Score */}
                <Card className="p-4 border border-border/80 bg-card rounded-lg shadow-2xs space-y-2">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Compliance Score</span>
                    <div className="p-2 rounded-lg bg-success-subtle text-success-subtle-foreground">
                      <BadgeCheck className="w-4 h-4" />
                    </div>
                  </div>
                  <span className="text-2xl sm:text-3xl font-black text-success-subtle-foreground tabular-nums block">
                    {complianceScore}%
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium block">Verified fleet compliance</span>
                </Card>

                {/* Card 2: Registered Vehicles */}
                <Card className="p-4 border border-border/80 bg-card rounded-lg shadow-2xs space-y-2">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Active Fleet</span>
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      <Truck className="w-4 h-4" />
                    </div>
                  </div>
                  <span className="text-2xl sm:text-3xl font-black text-foreground tabular-nums block">
                    {vehicles.length} / {partner.fleetSize}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium block">Vehicles in registry</span>
                </Card>

                {/* Card 3: Documents Vault */}
                <Card className="p-4 border border-border/80 bg-card rounded-lg shadow-2xs space-y-2">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Documents Vault</span>
                    <div className="p-2 rounded-lg bg-info-subtle text-info-subtle-foreground">
                      <FileText className="w-4 h-4" />
                    </div>
                  </div>
                  <span className="text-2xl sm:text-3xl font-black text-foreground tabular-nums block">
                    {documents.filter((d) => d.status === 'Verified').length}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium block">Verified documents</span>
                </Card>

                {/* Card 4: Compliance Alerts */}
                <Card className="p-4 border border-border/80 bg-card rounded-lg shadow-2xs space-y-2">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Compliance Alerts</span>
                    <div className="p-2 rounded-lg bg-warning-subtle text-warning-subtle-foreground">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                  </div>
                  <span className="text-2xl sm:text-3xl font-black text-warning-subtle-foreground tabular-nums block">
                    {complianceAlerts.length}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium block">Open items</span>
                </Card>
              </div>

              {/* Vehicles Registry Card */}
              <Card className="p-4 sm:p-6 border border-border/80 bg-card rounded-lg shadow-2xs space-y-5">
                <div className="flex items-center justify-between flex-wrap gap-3 border-b border-border/60 pb-3">
                  <div>
                    <h4 className="type-h4 font-semibold text-foreground flex items-center gap-2">
                      <Truck className="h-4.5 w-4.5 text-primary" />
                      Vehicles ({vehicles.length})
                    </h4>
                    <p className="type-caption text-muted-foreground mt-0.5">
                      Plates, capacities and trips run.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setShowAddVehicle((prev) => !prev)}
                    leadingIcon={<Plus className="h-4 w-4" />}
                    className="bg-primary text-primary-foreground text-xs font-semibold rounded-full shrink-0"
                  >
                    {showAddVehicle ? 'Cancel' : 'Register vehicle'}
                  </Button>
                </div>

                {/* Add Vehicle Inline Form */}
                {showAddVehicle && (
                  <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3 animate-in fade-in">
                    <h5 className="text-xs font-bold text-primary">New Vehicle</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      <Input
                        placeholder="Plate Number (e.g. DJ-ABJ-9922)"
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
                    <div className="flex justify-end pt-1">
                      <Button size="sm" onClick={handleAddVehicle} className="bg-primary text-primary-foreground font-semibold text-xs rounded-full px-4">
                        Save vehicle
                      </Button>
                    </div>
                  </div>
                )}

                {/* Vehicles Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {pagedVehicles.rows.map((veh) => (
                    <div key={veh.id} className="p-4 rounded-lg border border-border/80 bg-muted/20 space-y-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="font-extrabold text-foreground text-sm block font-mono">{veh.plateNumber}</span>
                            <VerificationBadge state={isVehicleVerified(veh) ? 'verified' : 'unverified'} size="sm" />
                          </div>
                          <span className="text-[11px] text-muted-foreground block">{veh.truckType}</span>
                        </div>
                        <StatusPill status={veh.operationalStatus} />
                      </div>

                      <div className="pt-2 border-t border-border/40 space-y-1 text-[11px]">
                        {veh.containerCapacity && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Capacity:</span>
                            <span className="font-semibold text-foreground">{veh.containerCapacity}</span>
                          </div>
                        )}
                        {/* Trips, not a standing driver. A truck is driven by
                            whoever the booking names; what the fleet card can
                            honestly say is how much work this one has done. */}
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Trips:</span>
                          <span className="font-bold text-primary">
                            {(veh.trips ?? 0).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => handleDeleteVehicle(veh.id)}
                          className="p-1 rounded-sm text-muted-foreground hover:text-destructive transition-colors"
                          title="Delete vehicle"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {vehicles.length > 0 ? (
                  <TablePager
                    paged={pagedVehicles}
                    noun="vehicles"
                    pageSize={vehiclesPageSize}
                    onPageSizeChange={setVehiclesPageSize}
                    pageSizeOptions={[12, 24, 48, 96]}
                  />
                ) : null}
              </Card>

              {/* Compliance Documents & Grey Card Vault Card */}
              <Card className="p-4 sm:p-6 border border-border/80 bg-card rounded-lg shadow-2xs space-y-5">
                <div className="flex items-center justify-between flex-wrap gap-3 border-b border-border/60 pb-3">
                  <div>
                    <h4 className="type-h4 font-semibold text-foreground flex items-center gap-2">
                      <FileText className="h-4.5 w-4.5 text-primary" />
                      Compliance Documents
                    </h4>
                    <p className="type-caption text-muted-foreground mt-0.5">
                      Grey Card and vehicle registration documents.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setShowAddDoc((prev) => !prev)}
                    leadingIcon={<Upload className="h-4 w-4" />}
                    className="bg-primary text-primary-foreground text-xs font-semibold rounded-full shrink-0"
                  >
                    {showAddDoc ? 'Cancel' : 'Upload document'}
                  </Button>
                </div>

                {/* Add Doc Form */}
                {showAddDoc && (
                  <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3 animate-in fade-in">
                    <h5 className="text-xs font-bold text-primary">New Document</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-dashed border-primary/40 bg-primary/5 text-primary text-xs font-semibold hover:bg-primary/10 transition-colors cursor-pointer">
                        <Upload className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{newDocFile ? newDocFile.name : 'Choose a file…'}</span>
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg"
                          className="hidden"
                          onChange={(e) => setNewDocFile(e.target.files?.[0] ?? null)}
                        />
                      </label>
                      <Select
                        value={newDocCategory}
                        options={DOC_CATEGORY_OPTIONS}
                        onChange={(e) => setNewDocCategory(e.target.value as PartnerDocumentCategory)}
                      />
                    </div>
                    <div className="flex justify-end pt-1">
                      <Button size="sm" onClick={handleAddDoc} disabled={!newDocFile} className="bg-primary text-primary-foreground font-semibold text-xs rounded-full px-4">
                        Save document
                      </Button>
                    </div>
                  </div>
                )}

                {/* Documents Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {pagedDocuments.rows.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-4 rounded-lg border border-border/60 bg-muted/20 hover:border-primary/40 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <IconChip icon={FileText} size={36} />
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-foreground text-xs truncate" title={doc.name}>
                            {doc.name}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {doc.category} · {doc.fileSize} · {doc.uploadDate}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Badge intent={doc.status === 'Verified' ? 'success' : 'warning'} size="sm">
                          {doc.status}
                        </Badge>
                        <button
                          type="button"
                          onClick={() => setViewingDoc(doc)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-primary transition-colors ml-1"
                          title="View Document"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void downloadDocument(doc.id, doc.name)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-primary transition-colors"
                          title="Download document"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDoc(doc.id)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive transition-colors"
                          title="Delete document"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {documents.length > 0 ? (
                  <TablePager
                    paged={pagedDocuments}
                    noun="documents"
                    pageSize={documentsPageSize}
                    onPageSizeChange={setDocumentsPageSize}
                    pageSizeOptions={[12, 24, 48, 96]}
                  />
                ) : null}
              </Card>

            </div>
          )}

          {/* =============================================================== */}
          {/* TAB 3: SHIPMENTS & CARGO                                        */}
          {/* =============================================================== */}
          {activeTab === 'shipments' && (
            <div className="space-y-6 animate-in fade-in">
              {/* Shipments Executive Metric Cards Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="p-4 border border-border/80 bg-card rounded-lg shadow-2xs space-y-2">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Total Bookings</span>
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      <Package className="w-4 h-4" />
                    </div>
                  </div>
                  <span className="text-2xl sm:text-3xl font-black text-foreground tabular-nums block">
                    {shipmentStats.total}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium block">All operational bookings</span>
                </Card>

                <Card className="p-4 border border-border/80 bg-card rounded-lg shadow-2xs space-y-2">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-[11px] font-bold uppercase tracking-wider">In Transit</span>
                    <div className="p-2 rounded-lg bg-warning-subtle text-warning-subtle-foreground">
                      <Truck className="w-4 h-4" />
                    </div>
                  </div>
                  <span className="text-2xl sm:text-3xl font-black text-warning-subtle-foreground tabular-nums block">
                    {shipmentStats.inTransit}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium block">Currently moving</span>
                </Card>

                <Card className="p-4 border border-border/80 bg-card rounded-lg shadow-2xs space-y-2">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Delivered</span>
                    <div className="p-2 rounded-lg bg-success-subtle text-success-subtle-foreground">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  </div>
                  <span className="text-2xl sm:text-3xl font-black text-success-subtle-foreground tabular-nums block">
                    {shipmentStats.delivered}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium block">Completed</span>
                </Card>

                <Card className="p-4 border border-border/80 bg-card rounded-lg shadow-2xs space-y-2">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Freight Value</span>
                    <div className="p-2 rounded-lg bg-info-subtle text-info-subtle-foreground">
                      <DollarSign className="w-4 h-4" />
                    </div>
                  </div>
                  <span className="text-2xl sm:text-3xl font-black text-foreground tabular-nums block">
                    FDJ {shipmentStats.totalFdj.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium block">Gross revenue</span>
                </Card>
              </div>

              {/* Shipments List Controls & Cards */}
              <Card className="p-4 sm:p-6 border border-border/80 bg-card rounded-lg shadow-2xs space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
                  <div>
                    <h4 className="type-h4 font-semibold text-foreground flex items-center gap-2">
                      <Package className="h-4.5 w-4.5 text-primary" />
                      Assigned Shipments
                    </h4>
                    <p className="type-caption text-muted-foreground mt-0.5">
                      Active, delivered, and registered shipments for {partner.companyLegalName}.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="relative min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="Search shipments..."
                        value={shipmentSearch}
                        onChange={(e) => setShipmentSearch(e.target.value)}
                        className="pl-8 text-xs h-9 rounded-lg"
                      />
                    </div>

                    <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border/60">
                      {(['ALL', 'IN_TRANSIT', 'DELIVERED', 'REGISTERED'] as const).map((filterKey) => (
                        <button
                          key={filterKey}
                          type="button"
                          onClick={() => setShipmentFilter(filterKey)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                            shipmentFilter === filterKey
                              ? 'bg-primary text-primary-foreground shadow-2xs'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {filterKey === 'ALL'
                            ? 'All'
                            : filterKey === 'IN_TRANSIT'
                            ? 'In Transit'
                            : filterKey === 'DELIVERED'
                            ? 'Delivered'
                            : 'Registered'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {pagedShipments.rows.map((shp) => (
                    // Both references print whole. Stripping the prefix was how
                    // the old twelve-character ids were made to fit; the scheme
                    // is short enough now that hiding what kind of reference it
                    // is costs more than it saves.
                    <ShipmentCard
                      key={shp.id}
                      shipmentNumber={shp.shipmentReference}
                      bookingNumber={shp.id}
                      origin={shp.origin}
                      destination={shp.destination}
                      // The shipper, not this carrier. Both of these printed
                      // the transporter's own name before, so a Red Sea Cargo
                      // Group job read as if Al-Baraka had booked it.
                      organization={shp.shipperCompany}
                      date={shp.date}
                      time={shp.time}
                      goodsType={shp.goodsType}
                      goodsWeight={shp.amount}
                      vehicleType={partner.companyLegalName}
                      driverName={shp.driverName || undefined}
                      createdBy={shp.shipperContact || shp.shipperCompany}
                      createdByInitials={shp.shipperCompany
                        .split(/\s+/)
                        .map((word) => word.charAt(0))
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                      status={displayShipmentStatus(shp.rawStatus, 'shipment')}
                      /* Teal full, brand yellow empty — the app-wide container
                         rule, so this carrier's jobs read the same here as they
                         do on the shipments list. */
                      statusIntent={(() => {
                        const state = containerStateOf(shp.rawStatus, Boolean(shp.containerNumber));
                        return state ? (`container-${state}` as const) : statusIntentOf(shp.rawStatus);
                      })()}
                      verified={true}
                      clickable
                      onClick={() =>
                        navigate(buildPath(ROUTES.shipmentOverview, { id: shp.shipmentReference }))
                      }
                    />
                  ))}

                  {filteredShipments.length === 0 && (
                    <div className="p-10 text-center text-sm text-muted-foreground border border-dashed border-border/70 rounded-lg">
                      No shipments yet.
                    </div>
                  )}

                  {filteredShipments.length > 0 && (
                    <TablePager
                      paged={pagedShipments}
                      noun="shipments"
                      pageSize={shipmentsPageSize}
                      onPageSizeChange={setShipmentsPageSize}
                      pageSizeOptions={[12, 24, 48, 96]}
                    />
                  )}
                </div>
              </Card>
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
