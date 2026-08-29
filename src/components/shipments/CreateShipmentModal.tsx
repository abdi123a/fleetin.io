import { useState, useEffect, useMemo, useRef, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parse, isValid } from 'date-fns';
import {
  Container,
  Truck,
  CheckCircle2,
  ArrowRight,
  DollarSign,
  Package,
  MapPin,
  AlertTriangle,
  Info,
  AlertCircle,
  Check,
  Layers,
  Wrench,
  Upload,
  Plus,
  Minus,
  Trash2,
  Zap,
} from '@/design-system/icons';
import {
  Button,
  Badge,
  Input,
  TagInput,
  Combobox,
  DatePicker,
  TimePicker,
  Avatar,
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/design-system';
import { useShippingLines } from '@/features/shipping-lines/shippingLines';
import { ShippingLineManager } from './ShippingLineManager';
import { TransporterRecommendations } from './TransporterRecommendations';
import { useShipmentStore } from '@/stores/shipment.store';
import { ROUTES, buildPath } from '@/config/routes';
import { useShippers } from '@/features/shippers/api/queries';
import { usePartners } from '@/features/partners/api/queries';
import { useCreateShipment } from '@/features/shipments/api/queries';
import type { CreateBookingItemPayload } from '@/features/bookings/api/bookingsService';
import { fetchBookingsForShipment } from '@/features/bookings/api/bookingsService';
import { createCycle } from '@/features/empty-returns';
import { normalizeContainerSize } from '@/data/emptyReturnData';
import { EmptyContainerOpportunities } from './EmptyContainerOpportunities';
import { useCreateProject, useProjects } from '@/features/finance';
import { usdToDjf } from '@/features/transporter-bi/config';
import { CompanyMark } from '@/features/transporter-bi/cards/CompanyLabel';
import type { PartnerRecord } from '@/types/partner';
import { cn } from '@/utils';
import { IconChip } from '@/design-system';

/**
 * A live estimate only — shown while the wizard is filled in, exactly as
 * before. The rate actually persisted comes back from `POST /shipments`,
 * computed server-side from the same partner pricing grid (BR-2.6): the
 * wizard has never had a rate input, and the browser must not be the one
 * setting the price that gets stored.
 */
function resolvePartnerRateFDJ(partner: PartnerRecord | undefined, vehicleType: string): number {
  const tiers = partner?.pricingGrid;
  if (!tiers || tiers.length === 0) return 65000;
  const needle = vehicleType.toLowerCase();
  const match =
    tiers.find(
      (tier) => needle.includes(tier.vehicleType.toLowerCase()) || tier.vehicleType.toLowerCase().includes(needle),
    ) ?? tiers[0];
  if (!match) return 65000;
  const amount = match.currency === 'USD' ? match.basePrice * usdToDjf() : match.basePrice;
  return Math.round(amount);
}

/**
 * One real `Booking` per container (or one, for bulk/machinery, which never
 * split across multiple containers today). Each transporter assignment's
 * `vehicles` count expands into that many consecutive slots — assignment A
 * with 3 vehicles claims the first 3 containers, assignment B the next N —
 * which is the only container↔vehicle mapping this wizard collects today;
 * there is no per-container vehicle picker to read instead. DPCS-sourced
 * bookings pass their externally-assigned booking id through as the real
 * `reference` (one per slot, same order) instead of letting the backend mint
 * one — DPCS already tracks these, Fleetin must not invent a second id for
 * the same container (see `project-real-booking-empty-return-backend`).
 */
function buildBookingItems(params: {
  isContainer: boolean;
  /** One entry per container, each carrying its own size — a shipment may mix 40ft and 20ft. */
  containerEntries: { number: string; size: ContainerSizeType }[];
  transporterAssignments: { partnerId: string; vehicles: number; bookingIds: string[] }[];
  cargoType: string;
  shipmentCategory: string;
  shippingLine?: string;
  containerReturnDepot?: string;
  containerReturnDeadline?: string;
  containerReturnFreeDays?: number;
  scheduledPickupTime: string;
}): CreateBookingItemPayload[] {
  const {
    isContainer,
    containerEntries,
    transporterAssignments,
    cargoType,
    shipmentCategory,
    shippingLine,
    containerReturnDepot,
    containerReturnDeadline,
    containerReturnFreeDays,
    scheduledPickupTime,
  } = params;

  if (!isContainer) {
    const first = transporterAssignments[0];
    return [
      {
        reference: first?.bookingIds[0]?.trim() || undefined,
        cargoType,
        shipmentCategory,
        partnerId: first?.partnerId || undefined,
        scheduledPickupTime,
      },
    ];
  }

  const slots: { partnerId: string; reference?: string }[] = [];
  for (const assignment of transporterAssignments) {
    for (let i = 0; i < assignment.vehicles; i += 1) {
      slots.push({
        partnerId: assignment.partnerId,
        reference: assignment.bookingIds[i],
      });
    }
  }

  return containerEntries.map((entry, index) => {
    const slot = slots[index];
    return {
      reference: slot?.reference?.trim() || undefined,
      // Per booking, never the shipment's mixed label — this one container is
      // one size, and Empty Return keys its depot rules off exactly that.
      cargoType: `Container (${entry.size})`,
      shipmentCategory,
      containerNumber: entry.number,
      shippingLine,
      partnerId: slot?.partnerId || undefined,
      containerReturnDepot,
      containerReturnDeadline,
      containerReturnFreeDays,
      scheduledPickupTime,
    };
  });
}

// ─── Static data ─────────────────────────────────────────────────────────────

export const CONTAINER_SIZES = [
  { value: '40ft', label: '40ft', desc: 'Standard Dry Container' },
  { value: '20ft', label: '20ft', desc: 'Standard Dry Container' },
] as const;

export type ContainerSizeType = (typeof CONTAINER_SIZES)[number]['value'];

/**
 * One size's worth of containers on the shipment. A shipment carries one group
 * per size it actually ships, so a mixed load — say two 40ft and one 20ft —
 * is a normal shipment rather than something the wizard refuses to describe.
 * Each group owns its own count and its own container numbers, because a 20ft
 * number is not interchangeable with a 40ft one.
 */
export interface ContainerGroup {
  size: ContainerSizeType;
  quantity: number;
  numbers: string[];
}

const CONTAINER_SIZE_ORDER = CONTAINER_SIZES.map((s) => s.value);

/** "2x 40ft + 1x 20ft" — the whole mix in one phrase, in the canonical size order. */
function describeContainerMix(groups: ContainerGroup[], separator = ' + '): string {
  return groups.map((g) => `${g.quantity}x ${g.size}`).join(separator);
}

/**
 * The two ends of every job Fleetin runs.
 *
 * The work is one leg — off a Djibouti quay, into a Djibouti free zone — so
 * the wizard offers exactly that and nothing else. There is no import leg, no
 * export leg and no upcountry corridor in this product, and an option for one
 * is a wrong answer sitting in a dropdown waiting to be picked.
 *
 * Both lists are the account's own, named the way the account names them. A
 * plausible-sounding berth that does not exist, or one that exists under a
 * different name, produces a shipment nobody can match against a real gate
 * pass — so nothing is added here that was not asked for.
 */
export const PICKUP_LOCATION_OPTIONS = [
  { value: 'Port of Djibouti', label: 'Port of Djibouti' },
  { value: 'Doraleh Container Terminal (SGTD)', label: 'Doraleh Container Terminal (SGTD)' },
  { value: 'Doraleh Multipurpose Port (DMP)', label: 'Doraleh Multipurpose Port (DMP)' },
  { value: 'Doraleh Oil Terminal / SJTP', label: 'Doraleh Oil Terminal / SJTP' },
  { value: 'Port of Tadjourah', label: 'Port of Tadjourah' },
  { value: 'Damerjog / DDID port infrastructure', label: 'Damerjog / DDID port infrastructure' },
  { value: 'Damerjog Liquid Bulk Port (DLBP)', label: 'Damerjog Liquid Bulk Port (DLBP)' },
];

/**
 * Road kilometres into each zone — an estimate the operator can overwrite.
 *
 * A number, not a place. The location itself is whatever was picked from the
 * lists above, and nothing here renames it or derives a second name for it:
 * every job runs inside Djibouti, so the city is simply Djibouti.
 */
function distanceForDropoff(location: string): number {
  if (location.includes('UKAB')) return 15;
  if (location.includes("Jaban'as")) return 20;
  if (location.includes('DIFTZ')) return 25;
  return 10;
}

export const DROPOFF_LOCATION_OPTIONS = [
  { value: 'UKAB Free Zone', label: 'UKAB Free Zone' },
  { value: "Jaban'as Free Zone", label: "Jaban'as Free Zone" },
  { value: 'Djibouti International Free Trade Zone (DIFTZ)', label: 'Djibouti International Free Trade Zone (DIFTZ)' },
  { value: 'Djibouti Free Zone (DFZ)', label: 'Djibouti Free Zone (DFZ)' },
];

// Custom pickup/drop-off locations the user adds are remembered locally, so a
// location typed once shows up as a normal option on every later shipment.
// Kept as two separate lists — pickup stays ports-only, drop-off stays
// free-zones-only, matching the fixed option lists above.
const CUSTOM_PICKUP_LOCATIONS_STORAGE_KEY = 'fleetin.customPickupLocations';
const CUSTOM_DROPOFF_LOCATIONS_STORAGE_KEY = 'fleetin.customDropoffLocations';

function loadCustomPickupLocations(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PICKUP_LOCATIONS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function saveCustomPickupLocations(locations: string[]): void {
  try {
    localStorage.setItem(CUSTOM_PICKUP_LOCATIONS_STORAGE_KEY, JSON.stringify(locations));
  } catch {
    // Storage unavailable (private browsing, quota) — the session still works, it just won't persist.
  }
}

function loadCustomDropoffLocations(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_DROPOFF_LOCATIONS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function saveCustomDropoffLocations(locations: string[]): void {
  try {
    localStorage.setItem(CUSTOM_DROPOFF_LOCATIONS_STORAGE_KEY, JSON.stringify(locations));
  } catch {
    // Storage unavailable (private browsing, quota) — the session still works, it just won't persist.
  }
}

// Sentinel selected when the user picks "+ Add custom…" from a Combobox —
// the entry field only reveals while the field's value equals this, the same
// way "Custom Shipper…" already works below.
const ADD_CUSTOM_OPTION = '__add_custom__';

// Custom bulk categories the user adds are remembered locally, so a category
// typed once shows up as a normal option on every later shipment.
const CUSTOM_BULK_COMMODITIES_STORAGE_KEY = 'fleetin.customBulkCommodities';

function loadCustomBulkCommodities(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_BULK_COMMODITIES_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

function saveCustomBulkCommodities(categories: string[]): void {
  try {
    localStorage.setItem(CUSTOM_BULK_COMMODITIES_STORAGE_KEY, JSON.stringify(categories));
  } catch {
    // Storage unavailable (private browsing, quota) — the session still works, it just won't persist.
  }
}

const MACHINERY_CLASSIFICATIONS = [
  { value: 'Heavy Hydraulic Excavator & Earthmovers', label: 'Heavy Hydraulic Excavator & Earthmovers (CAT 336 / Komatsu PC300)' },
  { value: 'Bulldozer & Motor Grader', label: 'Bulldozer & Motor Grader (CAT D8 / Komatsu D155)' },
  { value: 'Mobile Heavy Construction Crane', label: 'Mobile Heavy Construction Crane (50t – 100t Crane)' },
  { value: 'Industrial Power Generator & Transformer', label: 'Industrial Power Generator & High-Voltage Transformer' },
  { value: 'Agricultural Tractor & Combine Harvester', label: 'Agricultural Tractor & Combine Harvester' },
  { value: 'Mining, Drilling & Piling Rig Equipment', label: 'Mining, Drilling & Piling Rig Equipment' },
  { value: 'Heavy Commercial Trucks & Wheel Loaders', label: 'Heavy Commercial Trucks / Wheel Loaders / Dumpers' },
  { value: 'Factory Plant Machinery & Industrial Assembly', label: 'Factory Plant Machinery & Industrial Assembly' },
];

// Custom machinery types the user adds are remembered locally, so a type
// typed once shows up as a normal option on every later shipment.
const CUSTOM_MACHINERY_TYPES_STORAGE_KEY = 'fleetin.customMachineryTypes';

function loadCustomMachineryTypes(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_MACHINERY_TYPES_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

function saveCustomMachineryTypes(types: string[]): void {
  try {
    localStorage.setItem(CUSTOM_MACHINERY_TYPES_STORAGE_KEY, JSON.stringify(types));
  } catch {
    // Storage unavailable (private browsing, quota) — the session still works, it just won't persist.
  }
}

// ─── Step definitions ─────────────────────────────────────────────────────────

interface StepDef {
  id: number;
  title: string;
  shortTitle: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STEPS: [StepDef, ...StepDef[]] = [
  {
    id: 1,
    title: 'Shipment Details',
    shortTitle: 'Details',
    description: 'Shipper, cargo type, and category-specific details.',
    icon: Package,
  },
  {
    id: 2,
    title: 'Pickup & Drop-off',
    shortTitle: 'Route',
    description: 'Where the shipment is collected and where it goes.',
    icon: MapPin,
  },
  {
    /* Its own step since the fleet choice stopped being a formality: Fleetin
       can now say which carrier is already holding a container this shipment
       could take away, and that recommendation deserves a screen rather than a
       panel wedged under the drop-off address. */
    id: 3,
    title: 'Transporter & Fleet',
    shortTitle: 'Transporter',
    description: 'Who moves it — recommended first, or choose manually.',
    icon: Truck,
  },
  {
    id: 4,
    title: 'Pricing & Review',
    shortTitle: 'Pricing',
    description: 'Pricing, payment terms, and final review.',
    icon: DollarSign,
  },
];

// Converts a stored 24h "HH:mm" time to the TimePicker's 12h "hh:mm a" display format.
const to12Hour = (time24: string): string => {
  const parsed = parse(time24, 'HH:mm', new Date());
  return isValid(parsed) ? format(parsed, 'hh:mm a') : time24;
};

// Converts the TimePicker's 12h "hh:mm a" selection back to the stored 24h "HH:mm" format.
const to24Hour = (time12: string): string => {
  const parsed = parse(time12, 'hh:mm a', new Date());
  return isValid(parsed) ? format(parsed, 'HH:mm') : time12;
};

/**
 * Weld each ticked waiting empty to one of the new shipment's own bookings.
 *
 * The new shipment's bookings are fetched rather than read off the create
 * response — `POST /shipments` returns the mapped `Mission`, which carries a
 * count of its bookings but not their ids, and inventing ids to avoid one
 * request is how a pairing ends up pointing at nothing.
 *
 * One empty per booking, in order. A shipment with three containers and two
 * ticked empties pairs the first two and leaves the third as an ordinary trip,
 * which is exactly right: a pairing needs a load to ride out on, and there is
 * no third empty to give it.
 *
 * Every failure is collected rather than thrown. Half the pairings landing is a
 * better outcome than none of them, and the operator needs to know *which* half.
 */
async function pairWaitingEmpties(
  shipmentId: string,
  emptyBookingIds: string[],
  onWarning: (message: string | null) => void,
): Promise<void> {
  try {
    const bookings = await fetchBookingsForShipment(shipmentId);
    const available = bookings.filter((booking) => Boolean(booking.containerNumber));
    const failures: string[] = [];

    for (const [index, emptyBookingId] of emptyBookingIds.entries()) {
      const nextBooking = available[index];
      if (!nextBooking) {
        failures.push('more empties were ticked than this shipment has containers');
        break;
      }
      try {
        await createCycle({ bookingId: emptyBookingId, nextBookingId: nextBooking.id });
      } catch (error) {
        failures.push(error instanceof Error ? error.message : 'a pairing was refused');
      }
    }

    onWarning(
      failures.length > 0
        ? `The shipment was created, but ${failures.length} pairing${failures.length > 1 ? 's' : ''} could not be recorded (${failures.join('; ')}). Retry from Empty Container → Matching.`
        : null,
    );
  } catch (error) {
    onWarning(
      `The shipment was created, but its empty-container pairings could not be recorded (${
        error instanceof Error ? error.message : 'the bookings could not be read back'
      }). Retry from Empty Container → Matching.`,
    );
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CreateShipmentModal() {
  const { isCreateModalOpen, closeCreateModal, prefillData, addShipment } = useShipmentStore();
  const navigate = useNavigate();

  const { data: shippersResponse } = useShippers();
  const shippers = useMemo(() => shippersResponse?.items ?? [], [shippersResponse]);
  const sampleShippers = useMemo(
    () =>
      shippers.map((s) => ({
        id: s.id,
        name: s.primaryContact?.name ?? '',
        company: s.companyLegalName,
        logoUrl: s.logoUrl,
        phone: s.primaryContact?.phone ?? '',
        email: s.primaryContact?.email ?? '',
      })),
    [shippers],
  );

  const { data: partnersResponse } = usePartners();
  const partners = useMemo(() => partnersResponse?.items ?? [], [partnersResponse]);
  const defaultTransporter = partners[0];

  const createShipmentMutation = useCreateShipment();

  const [shipmentSource, setShipmentSource] = useState<'dpcs' | 'custom' | null>(null);
  const isDpcsSource = shipmentSource === 'dpcs';

  /**
   * The shipment's reference, typed by hand. Fleetin does not mint one: the
   * operator numbers the shipment and each of its bookings themselves, and the
   * server only refuses a number that is already taken. Empty by design —
   * a prefilled default is a generated number wearing a text box.
   */
  const [shipmentReference, setShipmentReference] = useState<string>('');

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [successToast, setSuccessToast] = useState<{ id: string; bookingId: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Form Fields State: Category (Container, Bulk, Machinery)
  const [shipmentCategory, setShipmentCategory] = useState<'containerized' | 'bulk' | 'machinery'>('containerized');

  // Container Specifics — one group per size shipped, so a mixed 40ft/20ft load
  // is expressible. Never empty: at least one size stays selected.
  const [containerGroups, setContainerGroups] = useState<ContainerGroup[]>([
    /* Zero, and no numbers. The wizard used to open on one 40ft container with
       a real-looking number already in the field, so every shipment started as
       a half-answered form: the count was a guess nobody had made and the
       number belonged to no one. Step 1 now refuses to advance until a count is
       set, which is the honest version of the same nudge. */
    { size: '40ft', quantity: 0, numbers: [] },
  ]);
  const [shippingLine, setShippingLine] = useState<string>('Maersk Line');
  /* The carrier list is the account's, not a constant: seven seeded lines plus
     whatever it has added, each with the mark somebody uploaded. */
  const shippingLines = useShippingLines();
  /* Step 3 shows the ranked five first and the full picker on request. Choosing
     a recommendation flips this too — a carrier still needs its vehicle count
     and booking numbers, which only the picker has. */
  const [manualTransporterPick, setManualTransporterPick] = useState(false);
  const [managingShippingLines, setManagingShippingLines] = useState(false);

  // Container Return (Date & Time section)
  const [returnDeadline, setReturnDeadline] = useState<string>('2026-08-04');
  const [returnDeadlineTime, setReturnDeadlineTime] = useState<string>('17:00');
  const [freeDays] = useState<number>(7);

  // Bulk Specifics — no preset categories; the user builds the list themselves.
  const [customBulkCommodities, setCustomBulkCommodities] = useState<string[]>(() => loadCustomBulkCommodities());
  const [bulkCommodity, setBulkCommodity] = useState<string>(() => loadCustomBulkCommodities()[0] ?? '');
  const [newBulkCommodityName, setNewBulkCommodityName] = useState<string>('');
  const bulkCommodityOptions = customBulkCommodities.map((c) => ({ value: c, label: c }));

  // Machinery Specifics
  const [machineryClassification, setMachineryClassification] = useState<string>(MACHINERY_CLASSIFICATIONS[0]?.value ?? 'Heavy Hydraulic Excavator & Earthmovers');
  const [customMachineryTypes, setCustomMachineryTypes] = useState<string[]>(() => loadCustomMachineryTypes());
  const [newMachineryTypeName, setNewMachineryTypeName] = useState<string>('');
  const machineryTypeOptions = [
    ...MACHINERY_CLASSIFICATIONS,
    ...customMachineryTypes.map((t) => ({ value: t, label: t })),
  ];

  // Cargo Specs (Weight) — stored canonically in kg; the unit toggle only affects display/entry.
  const [totalWeightKg, setTotalWeightKg] = useState<number>(25000);
  const [weightUnit, setWeightUnit] = useState<'kg' | 't'>('kg');
  const displayWeight = weightUnit === 't' ? totalWeightKg / 1000 : totalWeightKg;
  const handleWeightChange = (raw: number) => {
    setTotalWeightKg(weightUnit === 't' ? raw * 1000 : raw);
  };

  // Route Locations (Dropdown values & Pickup Date/Time)
  const [pickupLocation, setPickupLocation] = useState<string>(PICKUP_LOCATION_OPTIONS[0]?.value ?? 'Port of Djibouti');
  const [pickupCity, setPickupCity] = useState<string>('Djibouti');
  /* Today, not a date hardcoded when this wizard was written. The stale
     literal was quietly fatal to the empty-container recommendation: a box is
     only pairable if it is empty *before* the truck is needed, and every
     container that came free after 29 Jul failed that test against a pickup
     the operator never chose. */
  const [pickupDate, setPickupDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [pickupTime, setPickupTime] = useState<string>('08:30');
  const [customPickupLocations, setCustomPickupLocations] = useState<string[]>(() => loadCustomPickupLocations());
  const [newPickupLocationName, setNewPickupLocationName] = useState<string>('');
  const pickupLocationOptions = [
    ...PICKUP_LOCATION_OPTIONS,
    ...customPickupLocations.map((l) => ({ value: l, label: l })),
  ];
  const [deliveryLocation, setDeliveryLocation] = useState<string>(DROPOFF_LOCATION_OPTIONS[0]?.value ?? 'UKAB Free Zone');
  const [deliveryCity, setDeliveryCity] = useState<string>('Djibouti');
  const [estimatedDistanceKm, setEstimatedDistanceKm] = useState<number>(25);
  const [customDropoffLocations, setCustomDropoffLocations] = useState<string[]>(() => loadCustomDropoffLocations());
  const [newDropoffLocationName, setNewDropoffLocationName] = useState<string>('');
  const dropoffLocationOptions = [
    ...DROPOFF_LOCATION_OPTIONS,
    ...customDropoffLocations.map((l) => ({ value: l, label: l })),
  ];

  // Shipper — always a real, existing account; there is no "create a shipper
  // inline while creating a shipment" concept anywhere else in the product.
  const [selectedShipperId, setSelectedShipperId] = useState<string>('');

  // Which of the shipper's open Finance projects this shipment belongs to,
  // if any — '' means a one-off. Sent as `projectId` on the real create payload.
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const { data: clientProjects = [] } = useProjects({ shipperId: selectedShipperId, status: 'active' }, { enabled: Boolean(selectedShipperId) });

  // A shipper with no project yet shouldn't force the operator out to Finance
  // and back. The project is created against the same `POST /projects` the
  // Finance module uses, so it lands there — and on the client's page — as a
  // real project the moment it's made, not a placeholder this wizard invented.
  const createProjectMutation = useCreateProject();
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [newProjectStart, setNewProjectStart] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [newProjectEnd, setNewProjectEnd] = useState<string>('');
  const [newProjectEstimate, setNewProjectEstimate] = useState<string>('');
  const [projectError, setProjectError] = useState<string | null>(null);
  const isCreatingProject = selectedProjectId === ADD_CUSTOM_OPTION;
  /** The sentinel is a UI state, never an id — it must not reach the payload. */
  const resolvedProjectId = isCreatingProject ? '' : selectedProjectId;

  useEffect(() => {
    setSelectedProjectId('');
    setProjectError(null);
  }, [selectedShipperId]);

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name || !selectedShipperId || createProjectMutation.isPending) return;
    setProjectError(null);
    const estimate = Number(newProjectEstimate);
    try {
      const created = await createProjectMutation.mutateAsync({
        shipperId: selectedShipperId,
        name,
        startedAt: new Date(newProjectStart).toISOString(),
        contractEndAt: newProjectEnd ? new Date(newProjectEnd).toISOString() : undefined,
        monthlyEstimate:
          newProjectEstimate.trim() !== '' && Number.isFinite(estimate) && estimate >= 0 ? estimate : undefined,
      });
      setSelectedProjectId(created.id);
      setNewProjectName('');
      setNewProjectEnd('');
      setNewProjectEstimate('');
    } catch (error) {
      setProjectError(
        error instanceof Error ? error.message : 'Could not create the project. Please try again.',
      );
    }
  };

  /**
   * Waiting empty containers the operator has chosen to pair with this shipment.
   *
   * Booking ids of *other*, already-delivered containers — nothing to do with
   * the containers this shipment is carrying. They are welded to the new
   * shipment's own bookings immediately after it is created, which is the one
   * place a shipment can consume an empty that is otherwise heading for a
   * separate return trip. Empty by default: this is an offer, never a default.
   */
  const [pairedEmptyIds, setPairedEmptyIds] = useState<string[]>([]);
  /** Non-fatal: the shipment exists either way, so a failed pairing is reported, not thrown. */
  const [pairingWarning, setPairingWarning] = useState<string | null>(null);

  // Fleet
  /**
   * Derived, never picked. `applyContainerGroups` sets it from the container
   * sizes and `handleCategorySelect` from the cargo category, so it always
   * follows what is actually being shipped. The wizard used to offer a nine-
   * option "Preferred Vehicle Type" list next to the transporter rows; it was
   * removed because the cargo already decides the answer, and the only thing
   * a mismatched pick changed was which pricing tier the shipment matched.
   */
  const [vehicleType, setVehicleType] = useState<string>('Container Chassis Skeleton Carrier (40ft)');
  const [transporterAssignments, setTransporterAssignments] = useState<
    { id: string; partnerId: string; vehicles: number; bookingIds: string[] }[]
  >([{ id: 'TA-1', partnerId: '', vehicles: 1, bookingIds: [] }]);
  const transporterIdCounter = useRef(1);
  /** Once the operator types a vehicle count, the wizard stops guessing it. */
  const vehiclesTouched = useRef(false);

  // Both lists load asynchronously — seed the defaults once they arrive
  // rather than baking a mock id into the initial state.
  useEffect(() => {
    const firstShipper = sampleShippers[0];
    if (!selectedShipperId && firstShipper) {
      setSelectedShipperId(firstShipper.id);
    }
  }, [sampleShippers, selectedShipperId]);

  useEffect(() => {
    if (defaultTransporter) {
      setTransporterAssignments((prev) =>
        prev.map((a, i) => (i === 0 && !a.partnerId ? { ...a, partnerId: defaultTransporter.id } : a)),
      );
    }
  }, [defaultTransporter]);

  // Pricing — the rate lives per transporter (set in the Fleet step); the total is derived.
  const [paymentStatus, setPaymentStatus] = useState<'Paid' | 'Pending'>('Pending');
  // Fleetin's house commission, for the payout split shown in the review step.
  // Read-only here: the wizard displays where the money lands, it never sets it.
  // Normally empty — the price comes from the transporters' own price lists.
  // Filled only when an operator explicitly overrides with a negotiated figure.
  const [clientRateInput, setClientRateInput] = useState<string>('');
  /** Off by default: the price list decides, so the wizard cannot leave a shipment unpriced. */
  const [overridePrice, setOverridePrice] = useState(false);
  const resolveVehicleType = (groups: ContainerGroup[]): string => {
    const total = groups.reduce((sum, g) => sum + g.quantity, 0);
    const only = groups[0];
    return groups.length === 1 && only && total <= 1
      ? `Container Chassis Skeleton Carrier (${only.size})`
      : `Multi-Container Chassis Trailer (${describeContainerMix(groups)})`;
  };

  /** The single writer for the groups, so the default vehicle type never drifts. */
  const applyContainerGroups = (next: ContainerGroup[]) => {
    setContainerGroups(next);
    setVehicleType(resolveVehicleType(next));
  };

  const updateContainerGroup = (size: ContainerSizeType, patch: Partial<Omit<ContainerGroup, 'size'>>) => {
    applyContainerGroups(containerGroups.map((g) => (g.size === size ? { ...g, ...patch } : g)));
  };

  const toggleContainerSize = (size: ContainerSizeType) => {
    if (containerGroups.some((g) => g.size === size)) {
      // The last size stays put — a container shipment with no size is nothing.
      if (containerGroups.length === 1) return;
      applyContainerGroups(containerGroups.filter((g) => g.size !== size));
      return;
    }
    applyContainerGroups(
      [...containerGroups, { size, quantity: 1, numbers: [] }].sort(
        (a, b) => CONTAINER_SIZE_ORDER.indexOf(a.size) - CONTAINER_SIZE_ORDER.indexOf(b.size),
      ),
    );
  };

  const handleBookingIdsChange = (assignmentId: string, ids: string[]) => {
    updateTransporterAssignment(assignmentId, { bookingIds: ids });
  };

  const containerFileInputRef = useRef<HTMLInputElement>(null);
  /** Which size's list the pending upload fills — the file input itself is shared. */
  const containerUploadTarget = useRef<ContainerSizeType>('40ft');

  const openContainerNumbersUpload = (size: ContainerSizeType) => {
    containerUploadTarget.current = size;
    containerFileInputRef.current?.click();
  };

  const handleContainerNumbersFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const size = containerUploadTarget.current;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const numbers = text
        .split(/[\r\n,;]+/)
        .map((n) => n.trim().toUpperCase())
        .filter(Boolean);
      if (numbers.length > 0) {
        updateContainerGroup(size, { numbers, quantity: numbers.length });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Sync category changes with default vehicle types
  const handleCategorySelect = (category: 'containerized' | 'bulk' | 'machinery') => {
    setShipmentCategory(category);
    if (category === 'containerized') {
      setVehicleType(resolveVehicleType(containerGroups));
    } else if (category === 'bulk') {
      setVehicleType('Heavy Tipper Bulk Truck (Side/Rear Dump)');
    } else if (category === 'machinery') {
      setVehicleType('Heavy Lowbed Equipment Transport Trailer + Escort');
    }
  };

  useEffect(() => {
    if (prefillData) {
      if (prefillData.shipmentCategory) {
        if (prefillData.shipmentCategory === 'bulk') {
          setShipmentCategory('bulk');
        } else if (prefillData.shipmentCategory === 'special' || prefillData.shipmentCategory === 'bulky_goods' || prefillData.shipmentCategory === 'machinery') {
          setShipmentCategory('machinery');
        } else {
          setShipmentCategory('containerized');
        }
      }
      const { shipperCompany } = prefillData;
      if (shipperCompany) {
        const found = sampleShippers.find((s) => s.company.toLowerCase().includes(shipperCompany.toLowerCase()));
        if (found) setSelectedShipperId(found.id);
      }
      const pickupLoc = prefillData.pickupLocation;
      if (pickupLoc) {
        const match = PICKUP_LOCATION_OPTIONS.find((p) => p.value.toLowerCase().includes(pickupLoc.toLowerCase()));
        setPickupLocation(match?.value ?? pickupLoc);
      }
      if (prefillData.pickupCity) setPickupCity(prefillData.pickupCity);
      const delivLoc = prefillData.deliveryLocation;
      if (delivLoc) {
        const match = DROPOFF_LOCATION_OPTIONS.find((d) => d.value.toLowerCase().includes(delivLoc.toLowerCase()));
        setDeliveryLocation(match?.value ?? delivLoc);
      }
      if (prefillData.deliveryCity) setDeliveryCity(prefillData.deliveryCity);
      if (prefillData.totalWeightKg) setTotalWeightKg(prefillData.totalWeightKg);
      // A prefilled shipment describes one container of one size, so it collapses
      // the groups back to a single one rather than adding to whatever is there.
      const prefilledSize: ContainerSizeType | null = prefillData.cargoType
        ? prefillData.cargoType.includes('20')
          ? '20ft'
          : '40ft'
        : null;
      const prefilledNumber = prefillData.containerNumber;
      if (prefilledSize || prefilledNumber) {
        setContainerGroups((prev) => {
          const base = prev[0] ?? { size: '40ft' as ContainerSizeType, quantity: 1, numbers: [] };
          return [
            {
              size: prefilledSize ?? base.size,
              quantity: prefilledNumber ? 1 : base.quantity,
              numbers: prefilledNumber ? [prefilledNumber] : base.numbers,
            },
          ];
        });
      }
    }
  }, [prefillData, sampleShippers]);

  // Reset state when closed
  const handleClose = () => {
    closeCreateModal();
    setCurrentStep(1);
    setCompletedSteps([]);
    setSuccessToast(null);
    setSubmitError(null);
    setShipmentSource(null);
    setShipmentReference('');
    setTransporterAssignments((prev) => prev.map((a) => ({ ...a, bookingIds: [] })));
    // The pairing offer is per-shipment: carrying a tick into the next one
    // would pair a container against a job nobody chose it for.
    setPairedEmptyIds([]);
    setPairingWarning(null);
  };

  const isContainer = shipmentCategory === 'containerized';
  const isMixedContainerSizes = containerGroups.length > 1;
  const containerQuantity = containerGroups.reduce((sum, g) => sum + g.quantity, 0);
  /** Flattened, in group order — the order the bookings are minted in. */
  const containerEntries = useMemo(
    () =>
      containerGroups.flatMap((g) =>
        g.numbers.filter(Boolean).map((number) => ({ number, size: g.size })),
      ),
    [containerGroups],
  );
  const containerNumbers = useMemo(() => containerEntries.map((e) => e.number), [containerEntries]);
  /** How far one size's number list is off its own count. Negative = short. */
  const containerGroupDiff = (group: ContainerGroup) => group.numbers.filter(Boolean).length - group.quantity;
  const duplicateContainerNumbers = useMemo(() => {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const n of containerNumbers) {
      if (!n) continue;
      if (seen.has(n)) dupes.add(n);
      seen.add(n);
    }
    return dupes;
  }, [containerNumbers]);
  const hasDuplicateContainerNumbers = isContainer && duplicateContainerNumbers.size > 0;

  const activeShipper = sampleShippers.find((s) => s.id === selectedShipperId);

  /**
   * When the truck has to be at the pickup, as epoch ms.
   *
   * The panel below measures every waiting container's remaining deadline
   * against this exact instant — a box is only worth pairing if this load is
   * collected before that box has to be back.
   */
  const scheduledPickupMs = useMemo(() => {
    const parsed = new Date(`${pickupDate}T${pickupTime}:00`).getTime();
    return Number.isNaN(parsed) ? Date.now() : parsed;
  }, [pickupDate, pickupTime]);

  /** The container sizes on this shipment, in the form matching compares on. */
  const compatibleEmptySizes = useMemo(
    () => [...new Set(containerGroups.map((group) => normalizeContainerSize(group.size)))],
    [containerGroups],
  );

  const vehicleCount = transporterAssignments.reduce((sum, a) => sum + a.vehicles, 0);
  // One vehicle per container; bulk/machinery shipments default to a single dedicated vehicle.
  const vehiclesNeeded = isContainer ? containerQuantity : 1;
  const vehicleDiff = vehicleCount - vehiclesNeeded;

  // Until the operator sets a count by hand, the single fleet row follows what
  // the containers actually need. The wizard used to open on a fixed 3, which
  // contradicted the 1 container it also opened on and flagged its own default
  // as "2 extra vehicles assigned".
  useEffect(() => {
    if (vehiclesTouched.current) return;
    setTransporterAssignments((prev) => {
      const only = prev[0];
      if (prev.length !== 1 || !only || only.vehicles === vehiclesNeeded) return prev;
      return [{ ...only, vehicles: vehiclesNeeded }];
    });
  }, [vehiclesNeeded]);
  /**
   * Every reference on this shipment is typed, never minted — so the wizard
   * has to say exactly which one is missing. A booking number per vehicle,
   * because one vehicle carries one container and one container is one
   * booking; the same 1:1 the fleet count is already checked against.
   */
  const bookingNumbers = transporterAssignments.flatMap((a) =>
    a.bookingIds.map((b) => b.trim()).filter(Boolean),
  );
  const duplicateBookingNumbers = useMemo(() => {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const n of bookingNumbers) {
      if (seen.has(n)) dupes.add(n);
      seen.add(n);
    }
    return dupes;
  }, [bookingNumbers.join('\u0000')]);
  const shipmentReferenceMissing = !shipmentReference.trim();
  const bookingNumbersShort = transporterAssignments.filter(
    (a) => a.bookingIds.filter((b) => b.trim()).length < a.vehicles,
  );
  const bookingNumbersLong = transporterAssignments.filter(
    (a) => a.bookingIds.filter((b) => b.trim()).length > a.vehicles,
  );
  const referenceFieldsMissing =
    shipmentReferenceMissing || bookingNumbersShort.length > 0 || bookingNumbersLong.length > 0;
  // The shipment's price, and the whole of the pricing rule: containers times
  // the per-mission price on the chosen transporter's own list. This is what
  // the shipper is billed — Fleetin's commission is already inside it, and the
  // transporters are paid this less that commission.
  const totalCostFDJ = transporterAssignments.reduce((sum, a) => {
    const partner = partners.find((p) => p.id === a.partnerId);
    return sum + a.vehicles * resolvePartnerRateFDJ(partner, vehicleType);
  }, 0);

  // Every reason "Confirm & Create" can't be pressed yet — shown together near
  // the submit button so a missing field is never a silent no-op click (the
  // step-2 inline banners above say the same things, but by step 3 they're
  // scrolled out of view).
  /**
   * Each blocker carries the step that FIXES it, not the step it is read on.
   * The list lives in the step-3 footer, so a container-count problem was
   * being read next to the transporter rows that happened to be on screen —
   * an operator who had just changed transporters reasonably concluded the
   * transporters were the problem. Naming the step (and letting the line jump
   * there) is the difference between a blocker and a riddle.
   */
  const validationIssues: { step: number; text: string }[] = [];
  const blocker = (step: number, text: string) => validationIssues.push({ step, text });

  if (shipmentReferenceMissing) {
    blocker(1, isDpcsSource ? 'Enter the DPCS Shipment ID.' : 'Enter the shipment number.');
  }
  if (!activeShipper) blocker(1, 'Select a shipper.');
  if (isContainer) {
    if (containerQuantity === 0) {
      blocker(1, 'Set how many containers this shipment carries.');
    }
    for (const group of containerGroups) {
      const diff = containerGroupDiff(group);
      if (diff === 0) continue;
      // Name the size only on a mixed load — on a single-size shipment it just
      // repeats what the one panel above already says.
      const sized = isMixedContainerSizes ? `${group.size} ` : '';
      blocker(
        1,
        diff < 0
          ? `Add ${Math.abs(diff)} more ${sized}container number(s) — you set the count to ${group.quantity}.`
          : `Remove ${diff} extra ${sized}container number(s), or raise the count above ${group.quantity}.`,
      );
    }
  }
  if (hasDuplicateContainerNumbers) {
    blocker(1, 'Remove the duplicate container number(s) — each one must be unique.');
  }
  if (isCreatingProject) {
    blocker(1, 'Finish creating the new project, or pick an existing one.');
  }
  if (transporterAssignments.some((a) => !a.partnerId)) {
    blocker(3, 'Assign a transporter to every fleet row.');
  }
  if (vehicleDiff !== 0) {
    // Say where the target comes from: it is the container count from step 1,
    // not anything chosen on the transporter rows this sits next to.
    blocker(
      3,
      vehicleDiff < 0
        ? `Assign ${Math.abs(vehicleDiff)} more vehicle(s) — ${vehiclesNeeded} container(s) need ${vehiclesNeeded}.`
        : `Remove ${vehicleDiff} extra vehicle(s) — ${vehiclesNeeded} container(s) need ${vehiclesNeeded}.`,
    );
  }
  if (bookingNumbersShort.length > 0) {
    blocker(3, 'Enter a booking number for every vehicle — one per container.');
  }
  if (bookingNumbersLong.length > 0) {
    blocker(3, 'Remove the extra booking number(s) — there is one per vehicle.');
  }
  if (duplicateBookingNumbers.size > 0) {
    blocker(
      3,
      `Booking number${duplicateBookingNumbers.size > 1 ? 's' : ''} ${[...duplicateBookingNumbers].join(', ')} ${duplicateBookingNumbers.size > 1 ? 'are' : 'is'} used twice — each booking needs its own.`,
    );
  }

  /**
   * Put a carrier into the fleet rows.
   *
   * Fills the first empty slot, or adds one — assigning from a recommendation
   * must never silently overwrite a carrier the operator already chose.
   */
  const assignTransporter = (partnerId: string) => {
    const openSlot = transporterAssignments.find((a) => !a.partnerId);
    if (openSlot) {
      updateTransporterAssignment(openSlot.id, { partnerId });
      return;
    }
    if (transporterAssignments.some((a) => a.partnerId === partnerId)) return;
    const first = transporterAssignments[0];
    if (first && transporterAssignments.length === 1 && !first.bookingIds.length) {
      updateTransporterAssignment(first.id, { partnerId });
    } else {
      addTransporterAssignment();
    }
  };

  const addTransporterAssignment = () => {
    const usedIds = new Set(transporterAssignments.map((a) => a.partnerId));
    const nextPartner = partners.find((p) => !usedIds.has(p.id)) ?? partners[0];
    transporterIdCounter.current += 1;
    setTransporterAssignments((prev) => [
      ...prev,
      { id: `TA-${transporterIdCounter.current}`, partnerId: nextPartner?.id ?? '', vehicles: 1, bookingIds: [] },
    ]);
  };

  const removeTransporterAssignment = (id: string) => {
    setTransporterAssignments((prev) => (prev.length > 1 ? prev.filter((a) => a.id !== id) : prev));
  };

  const updateTransporterAssignment = (
    id: string,
    patch: Partial<{ partnerId: string; vehicles: number; bookingIds: string[] }>,
  ) => {
    setTransporterAssignments((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  const handleAddCustomBulkCommodity = () => {
    const trimmed = newBulkCommodityName.trim();
    if (!trimmed) return;
    const alreadyKnown = bulkCommodityOptions.some((o) => o.label.toLowerCase() === trimmed.toLowerCase());
    if (!alreadyKnown) {
      const next = [...customBulkCommodities, trimmed];
      setCustomBulkCommodities(next);
      saveCustomBulkCommodities(next);
    }
    setBulkCommodity(trimmed);
    setNewBulkCommodityName('');
  };

  const handleAddCustomMachineryType = () => {
    const trimmed = newMachineryTypeName.trim();
    if (!trimmed) return;
    const alreadyKnown = machineryTypeOptions.some((o) => o.label.toLowerCase() === trimmed.toLowerCase());
    if (!alreadyKnown) {
      const next = [...customMachineryTypes, trimmed];
      setCustomMachineryTypes(next);
      saveCustomMachineryTypes(next);
    }
    setMachineryClassification(trimmed);
    setNewMachineryTypeName('');
  };

  const handleAddCustomPickupLocation = () => {
    const trimmed = newPickupLocationName.trim();
    if (!trimmed) return;
    const alreadyKnown = pickupLocationOptions.some((o) => o.label.toLowerCase() === trimmed.toLowerCase());
    if (!alreadyKnown) {
      const next = [...customPickupLocations, trimmed];
      setCustomPickupLocations(next);
      saveCustomPickupLocations(next);
    }
    setPickupLocation(trimmed);
    setNewPickupLocationName('');
  };

  const handleAddCustomDropoffLocation = () => {
    const trimmed = newDropoffLocationName.trim();
    if (!trimmed) return;
    const alreadyKnown = dropoffLocationOptions.some((o) => o.label.toLowerCase() === trimmed.toLowerCase());
    if (!alreadyKnown) {
      const next = [...customDropoffLocations, trimmed];
      setCustomDropoffLocations(next);
      saveCustomDropoffLocations(next);
    }
    setDeliveryLocation(trimmed);
    setNewDropoffLocationName('');
  };

  const handleNext = () => {
    setCompletedSteps((prev) => Array.from(new Set([...prev, currentStep])));
    setCurrentStep((prev) => Math.min(prev + 1, STEPS.length));
  };

  // DPCS only moves containers, and the shipper's side is already settled
  // through the port — so a DPCS shipment always starts out Container / Paid,
  // non-negotiably. "Paid" is the shipper's payment only: it lands in Fleetin's
  // account, and the transporter is paid out of it after the delivery.
  const handleChooseSource = (source: 'dpcs' | 'custom') => {
    setShipmentSource(source);
    if (source === 'dpcs') {
      setShipmentCategory('containerized');
      setPaymentStatus('Paid');
    }
  };

  const handleBack = () => {
    if (currentStep === 1) {
      setShipmentSource(null);
      return;
    }
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleStepClick = (stepId: number) => {
    if (stepId <= currentStep || completedSteps.includes(stepId - 1)) {
      setCurrentStep(stepId);
    }
  };

  /**
   * "40ft" for a single-size load — the label every existing shipment already
   * carries — and "2x 40ft, 1x 20ft" once there is a genuine mix to spell out.
   */
  const containerMixLabel = isMixedContainerSizes
    ? describeContainerMix(containerGroups, ', ')
    : (containerGroups[0]?.size ?? '40ft');

  const getResolvedCargoLabel = (): string => {
    if (isContainer) {
      return `Container (${containerMixLabel})`;
    }
    if (shipmentCategory === 'bulk') {
      const commodityName = bulkCommodity.split('(')[0]?.trim() || bulkCommodity;
      return `Bulk Cargo (${commodityName})`;
    }
    const machineryName = machineryClassification.split('(')[0]?.trim() || machineryClassification;
    return `Machinery (${machineryName})`;
  };

  const canSubmit = validationIssues.length === 0;

  const handleCreateShipment = async () => {
    if (!activeShipper || !canSubmit) return;

    setSubmitError(null);

    const resolvedContainerNumber = isContainer ? containerNumbers.filter(Boolean).join(', ') : undefined;
    const scheduledPickupTimeIso = new Date(`${pickupDate}T${pickupTime}:00`).toISOString();
    const containerReturnDeadlineIso = isContainer
      ? new Date(`${returnDeadline}T${returnDeadlineTime}:00`).toISOString()
      : undefined;

    try {
      const created = await createShipmentMutation.mutateAsync({
        shipmentSource: shipmentSource ?? 'custom',
        // The operator's own number, on every shipment. On a DPCS job that is
        // DPCS's id and it goes in both columns, exactly as before; on a
        // Fleetin-direct one it is simply the number they chose.
        reference: shipmentReference.trim(),
        dpcsReference: isDpcsSource ? shipmentReference.trim() : undefined,
        bookingId: !isDpcsSource ? prefillData?.bookingId : undefined,
        shipperId: activeShipper.id,
        transporterAssignments: transporterAssignments.map((a) => ({
          partnerId: a.partnerId,
          vehicles: a.vehicles,
          bookingIds: a.bookingIds,
        })),
        preferredVehicleType: vehicleType,
        pickupLocationName: pickupLocation,
        pickupLocationAddress: pickupLocation,
        pickupLocationCity: pickupCity,
        pickupGateOrTerminal: 'Terminal Gate 4A',
        deliveryLocationName: deliveryLocation,
        deliveryLocationAddress: deliveryLocation,
        deliveryLocationCity: deliveryCity,
        estimatedDistanceKm: estimatedDistanceKm,
        estimatedDurationHours: '18h 30m',
        cargoType: getResolvedCargoLabel(),
        shipmentCategory: shipmentCategory === 'machinery' ? 'bulky_goods' : shipmentCategory,
        machineryType: shipmentCategory === 'machinery' ? machineryClassification : undefined,
        bulkCommodity: shipmentCategory === 'bulk' ? bulkCommodity : undefined,
        containerNumber: resolvedContainerNumber,
        shippingLine: isContainer ? shippingLine : undefined,
        containerReturnDepot: isContainer ? deliveryLocation : undefined,
        containerReturnDeadline: containerReturnDeadlineIso,
        containerReturnFreeDays: isContainer ? freeDays : undefined,
        goodsDescription:
          isContainer
            ? `Container Cargo (${containerMixLabel})`
            : shipmentCategory === 'bulk'
            ? bulkCommodity
            : machineryClassification,
        totalWeightKg: totalWeightKg,
        paymentStatus,
        scheduledPickupTime: scheduledPickupTimeIso,
        clientRateMinorUnits: clientRateInput.trim() ? Number(clientRateInput) : undefined,
        projectId: resolvedProjectId || undefined,
        // One real booking per container (or one, for bulk/machinery) — the
        // shipment above is the shipper's request; these are what Empty Return
        // and per-container tracking actually key off. Sent in the same request
        // so the two can't half-succeed: this used to be a second call, and a
        // failure there left a shipment behind with no containers at all.
        bookings: buildBookingItems({
          isContainer,
          containerEntries,
          transporterAssignments,
          cargoType: getResolvedCargoLabel(),
          shipmentCategory: shipmentCategory === 'machinery' ? 'bulky_goods' : shipmentCategory,
          shippingLine: isContainer ? shippingLine : undefined,
          containerReturnDepot: isContainer ? deliveryLocation : undefined,
          containerReturnDeadline: containerReturnDeadlineIso,
          containerReturnFreeDays: isContainer ? freeDays : undefined,
          scheduledPickupTime: scheduledPickupTimeIso,
        }),
      });

      addShipment(created);

      // Pair the waiting empties the operator ticked in the Fleet step.
      //
      // Deliberately *after* the shipment lands, and deliberately not fatal.
      // The shipment is the thing being created; a pairing is an optimisation
      // on top of it, and a container that got claimed by somebody else in the
      // last thirty seconds must not roll back a job that is otherwise
      // perfectly good. So a failure here is reported beside the success, and
      // the operator can redo it in Matching in two clicks.
      if (pairedEmptyIds.length > 0) {
        await pairWaitingEmpties(created.id, pairedEmptyIds, setPairingWarning);
      }

      setSuccessToast({ id: created.id, bookingId: created.bookingId });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Something went wrong creating this shipment. Please try again.');
    }
  };

  const handleFinishAndNavigate = () => {
    if (successToast) {
      const id = successToast.id;
      setSuccessToast(null);
      handleClose();
      navigate(buildPath(ROUTES.shipmentOverview, { id }));
    }
  };

  const currentStepDef: StepDef = STEPS[currentStep - 1] ?? STEPS[0];

  return (
    <Sheet open={isCreateModalOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 overflow-hidden border-l border-border bg-background p-0 sm:max-w-md"
      >
        <SheetTitle className="sr-only">Create New Shipment</SheetTitle>
        <SheetDescription className="sr-only">
          Multi-step form to configure and create a new shipment.
        </SheetDescription>

        {/* ── SUCCESS STATE ── */}
        {successToast ? (
          <div className="flex flex-1 flex-col items-center justify-center space-y-6 overflow-y-auto px-6 py-16 text-center sm:px-8">
            <div className="w-16 h-16 rounded-full bg-success-subtle text-success-subtle-foreground flex items-center justify-center">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-extrabold text-foreground">Shipment Created!</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Shipment <span className="font-extrabold text-foreground">#{successToast.id}</span> (linked to Booking #{successToast.bookingId}) has been added to operational dispatch.
              </p>
              {isContainer && (
                <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg text-xs font-semibold text-primary flex items-center justify-center gap-2 max-w-sm mx-auto">
                  <Container className="w-4 h-4" />
                  <span>Now an open full load in Empty Container Matching</span>
                </div>
              )}
              {pairedEmptyIds.length > 0 && !pairingWarning && (
                <div className="p-3 bg-success-subtle border border-success/30 rounded-lg text-xs font-semibold text-success-subtle-foreground flex items-center justify-center gap-2 max-w-sm mx-auto">
                  <Check className="w-4 h-4" />
                  <span>
                    {pairedEmptyIds.length} empty container
                    {pairedEmptyIds.length > 1 ? 's' : ''} paired — that many empty returns avoided
                  </span>
                </div>
              )}
              {pairingWarning && (
                <div className="p-3 bg-warning-subtle border border-warning/30 rounded-lg text-xs font-semibold text-warning-subtle-foreground flex items-start gap-2 max-w-sm mx-auto text-left">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{pairingWarning}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={handleClose} className="rounded-lg px-5">
                Close
              </Button>
              <Button variant="primary" size="sm" onClick={handleFinishAndNavigate} className="rounded-lg px-5 gap-2">
                <span>View Shipment</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : shipmentSource === null ? (
          /* ── SOURCE SELECTION GATE ── */
          <div className="flex flex-1 flex-col justify-center gap-8 overflow-y-auto px-6 py-10 sm:px-8">
            <div className="space-y-1 text-center">
              <h2 className="text-xl font-extrabold tracking-tight text-foreground">How is this shipment being booked?</h2>
              <p className="text-xs text-muted-foreground">This decides where the shipment came from — you enter its number and its bookings’ numbers either way.</p>
            </div>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => handleChooseSource('dpcs')}
                className="flex w-full cursor-pointer flex-col items-center gap-3 rounded-lg border border-border bg-card px-4 py-7 text-center transition-all hover:border-primary/30 hover:bg-secondary/40"
              >
                <div className="text-sm font-bold text-foreground">Shipment from DPCS</div>
                <img src="/logo/dpcs-logo.png" alt="DPCS" className="h-12 w-auto object-contain" />
                <p className="text-xs text-muted-foreground">DPCS already assigned the numbers — enter them as they are.</p>
              </button>

              <button
                type="button"
                onClick={() => handleChooseSource('custom')}
                className="flex w-full cursor-pointer flex-col items-center gap-3 rounded-lg border border-border bg-card px-4 py-7 text-center transition-all hover:border-primary/30 hover:bg-secondary/40"
              >
                <div className="text-sm font-bold text-foreground">Custom Shipment</div>
                <img src="/logo/fleetin-wordmark.png" alt="FLEETIN" className="h-12 w-auto object-contain" />
                <p className="text-xs text-muted-foreground">Fleetin-direct — you choose the shipment and booking numbers.</p>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ── STICKY HEADER ── */}
            <div className="shrink-0 space-y-4 border-b border-border/40 px-6 pb-4 pt-6 sm:px-8 sm:pt-8">
              <div className="space-y-1 pr-8">
                <h2 className="text-xl font-extrabold tracking-tight text-foreground">
                  {prefillData?.bookingId ? (
                    <span className="flex flex-wrap items-center gap-2">
                      Create Shipment
                      <Badge variant="subtle" intent="info" size="sm">
                        From #{prefillData.bookingId}
                      </Badge>
                    </span>
                  ) : (
                    <span className="flex flex-wrap items-center gap-2">
                      Create New Shipment
                      {isDpcsSource ? (
                        <Badge variant="subtle" intent="info" size="sm">
                          DPCS
                        </Badge>
                      ) : (
                        <Badge variant="subtle" size="sm">
                          Custom
                        </Badge>
                      )}
                    </span>
                  )}
                </h2>
                <p className="text-xs text-muted-foreground">{currentStepDef.description}</p>
              </div>

              {/* ── STEP NAV ── */}
              <div className="flex items-center">
                {STEPS.map((step, idx) => {
                  const isCurrent = step.id === currentStep;
                  const isCompleted = completedSteps.includes(step.id);
                  const isLast = idx === STEPS.length - 1;
                  return (
                    <div key={step.id} className={cn('flex items-center', !isLast && 'flex-1')}>
                      <button
                        type="button"
                        onClick={() => handleStepClick(step.id)}
                        className="flex cursor-pointer flex-col items-center gap-1.5"
                      >
                        <span
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all',
                            isCurrent
                              ? 'bg-primary text-primary-foreground ring-4 ring-primary/15'
                              : isCompleted
                                ? 'bg-primary text-primary-foreground'
                                : 'border-2 border-border bg-surface text-muted-foreground',
                          )}
                        >
                          {isCompleted ? <Check className="h-4 w-4 stroke-[3]" /> : step.id}
                        </span>
                        <span
                          className={cn(
                            'whitespace-nowrap text-[11px] font-semibold leading-none',
                            isCurrent || isCompleted ? 'text-foreground' : 'text-muted-foreground',
                          )}
                        >
                          {step.shortTitle}
                        </span>
                      </button>
                      {!isLast && (
                        <div
                          className={cn(
                            'mx-2 h-0.5 flex-1 rounded-full transition-colors',
                            isCompleted ? 'bg-primary' : 'bg-border',
                          )}
                          style={{ marginBottom: '18px' }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── SCROLLABLE BODY ── */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 sm:px-8">
            <div key={currentStep} className="min-h-[240px] space-y-6">
              {/* ─ STEP 1: Shipment Details ─ */}
              {currentStep === 1 && (
                <div className="space-y-5">
                  {/* Shipment Number — typed, never minted. See `handleCreateShipment`. */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                      {isDpcsSource ? 'DPCS Shipment ID *' : 'Shipment Number *'}
                    </label>
                    <Input
                      value={shipmentReference}
                      onChange={(e) => setShipmentReference(e.target.value)}
                      placeholder={isDpcsSource ? 'DPCS-DJ-2026-9901' : 'Type this shipment’s number'}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      {isDpcsSource
                        ? 'The Shipment ID DPCS already generated for this booking — Fleetin will not create a new one.'
                        : 'You choose this number — Fleetin will not generate one. It is refused only if another shipment already uses it.'}
                    </p>
                  </div>

                  {/* Shipper / Exporting Entity */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                      Shipper / Exporting Entity *
                    </label>
                    <Combobox
                      value={selectedShipperId}
                      options={sampleShippers.map((s) => ({
                        value: s.id,
                        label: s.company,
                        icon: <CompanyMark id={s.id} name={s.company} logoUrl={s.logoUrl} size="xs" />,
                      }))}
                      onChange={setSelectedShipperId}
                    />
                  </div>

                  {/* Project — which of the shipper's open finance contracts this shipment bills against */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                      Project <span className="normal-case text-muted-foreground/70">(optional)</span>
                    </label>
                    <Combobox
                      value={selectedProjectId}
                      disabled={!selectedShipperId}
                      placeholder="No project — one-off shipment"
                      options={[
                        { value: '', label: 'No project — one-off shipment' },
                        ...clientProjects.map((p) => ({
                          value: p.id,
                          label: `${p.name} (${p.reference})`,
                        })),
                        { value: ADD_CUSTOM_OPTION, label: '+ New project…' },
                      ]}
                      onChange={setSelectedProjectId}
                    />

                    {isCreatingProject ? (
                      <div className="space-y-3 rounded-lg border border-border/60 bg-secondary/30 p-3">
                        <p className="text-[11px] font-bold text-foreground">
                          New project for {activeShipper?.company ?? 'this shipper'}
                        </p>
                        <Input
                          autoFocus
                          value={newProjectName}
                          onChange={(e) => setNewProjectName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void handleCreateProject();
                            }
                          }}
                          placeholder="Project name, e.g. Q4 electronics corridor"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              Starts
                            </label>
                            <DatePicker value={newProjectStart} onChange={setNewProjectStart} />
                          </div>
                          <div className="space-y-1">
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              Contract ends <span className="normal-case">(optional)</span>
                            </label>
                            <DatePicker value={newProjectEnd} onChange={setNewProjectEnd} />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Monthly estimate <span className="normal-case">(optional)</span>
                          </label>
                          <Input
                            type="number"
                            min={0}
                            value={newProjectEstimate}
                            onChange={(e) => setNewProjectEstimate(e.target.value)}
                            placeholder="0"
                            suffixText="FDJ"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            A planning figure only — it never caps or delays a shipment.
                          </p>
                        </div>
                        {projectError ? (
                          <div className="flex items-start gap-2 rounded-md bg-danger-subtle p-2.5 text-[11px] text-danger-subtle-foreground">
                            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>{projectError}</span>
                          </div>
                        ) : null}
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handleCreateProject()}
                            disabled={!newProjectName.trim() || createProjectMutation.isPending}
                            leadingIcon={<Plus className="h-3.5 w-3.5" />}
                          >
                            {createProjectMutation.isPending ? 'Creating…' : 'Create project'}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedProjectId('');
                              setProjectError(null);
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          It appears in Finance under this shipper straight away, with this shipment billed to it.
                        </p>
                      </div>
                    ) : selectedShipperId && clientProjects.length === 0 ? (
                      <p className="text-[11px] font-medium text-muted-foreground">
                        No open finance projects for this shipper — book it as a one-off, or{' '}
                        <button
                          type="button"
                          onClick={() => setSelectedProjectId(ADD_CUSTOM_OPTION)}
                          className="cursor-pointer font-bold text-primary underline-offset-2 hover:underline"
                        >
                          create one now
                        </button>
                        .
                      </p>
                    ) : null}
                  </div>

                  {/* Shipment Category Selector */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                      Shipment Type & Cargo Category *
                    </label>
                    <div className={cn('grid grid-cols-1 gap-2.5', !isDpcsSource && 'sm:grid-cols-3')}>
                      {(
                        [
                          {
                            key: 'containerized' as const,
                            label: 'Container',
                            sub: '40ft or 20ft',
                            icon: Container,
                            tone: 'primary' as const,
                          },
                          {
                            key: 'bulk' as const,
                            label: 'Bulk Cargo',
                            sub: 'Grain, clinker, silo',
                            icon: Layers,
                            tone: 'primary' as const,
                          },
                          {
                            key: 'machinery' as const,
                            label: 'Machinery',
                            sub: 'Excavators, cranes',
                            icon: Wrench,
                            tone: 'accent' as const,
                          },
                        ] as const
                      )
                        .filter((option) => !isDpcsSource || option.key === 'containerized')
                        .map(({ key, label, sub, icon: Icon, tone }) => {
                        const isSelected = shipmentCategory === key;
                        const isAccent = tone === 'accent';

                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => handleCategorySelect(key)}
                            className={cn(
                              'flex cursor-pointer flex-col gap-1.5 rounded-lg border p-3.5 text-left transition-all',
                              isSelected
                                ? isAccent
                                  ? 'border-accent bg-accent-subtle ring-2 ring-accent/25'
                                  : 'border-primary bg-primary/5 ring-2 ring-primary/20'
                                : 'border-border bg-card hover:border-primary/30 hover:bg-secondary/40',
                            )}
                          >
                            <IconChip icon={Icon} size={36} tint={isAccent ? 'orange' : 'teal'} />
                            <div>
                              <div className="text-xs font-bold leading-tight text-foreground">
                                {label}
                              </div>
                              <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                                {sub}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 1. CONTAINER SIZES & RETURN SPECIFICATIONS */}
                  {isContainer && (
                    <div className="space-y-4 p-4 rounded-lg border border-border/60 bg-secondary/30 shadow-2xs">
                      <div className="flex items-center gap-2 text-xs font-bold text-foreground pb-1 border-b border-border/40">
                        <Container className="w-4 h-4 text-primary" />
                        <span>Container Details</span>
                      </div>
                      {/* Container Sizes — more than one may be selected, because a
                          single shipment routinely carries a mixed 40ft/20ft load. */}
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-foreground block">
                          Container Sizes *
                        </label>
                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                          {CONTAINER_SIZES.map((size) => {
                            const isSelected = containerGroups.some((g) => g.size === size.value);
                            const isLastSelected = isSelected && containerGroups.length === 1;
                            return (
                              <button
                                key={size.value}
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => toggleContainerSize(size.value)}
                                className={cn(
                                  'flex flex-col gap-1 rounded-lg border p-3 text-left transition-all',
                                  isLastSelected ? 'cursor-default' : 'cursor-pointer',
                                  isSelected
                                    ? 'border-primary bg-primary text-primary-foreground shadow-xs ring-1 ring-primary'
                                    : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-secondary/60'
                                )}
                              >
                                <div className="flex items-center justify-between w-full">
                                  <span className="text-xs font-bold">{size.label}</span>
                                  {isSelected ? (
                                    <Check className="h-4 w-4 shrink-0 stroke-[3] text-primary-foreground" />
                                  ) : (
                                    <Container className="h-4 w-4 shrink-0 text-primary" />
                                  )}
                                </div>
                                <span className={cn('text-[10px] leading-tight', isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                                  {size.desc}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {isMixedContainerSizes
                            ? `Mixed load — ${describeContainerMix(containerGroups)}. Each size keeps its own count and numbers.`
                            : 'Select both to ship a mixed load of 40ft and 20ft containers together.'}
                        </p>
                      </div>

                      {/* One panel per size: its own count, its own numbers. */}
                      <input
                        ref={containerFileInputRef}
                        type="file"
                        accept=".csv,.txt,text/csv,text/plain"
                        className="hidden"
                        onChange={handleContainerNumbersFileUpload}
                      />
                      {containerGroups.map((group) => {
                        const diff = containerGroupDiff(group);
                        const sized = isMixedContainerSizes ? `${group.size} ` : '';
                        /* The repeated numbers in THIS list, named. The chips
                           turn red on their own, but red with no matching note
                           under the field left a reader with three flagged
                           chips and one message that only explained the count. */
                        const repeated = [...new Set(group.numbers.filter((n) => duplicateContainerNumbers.has(n)))];
                        return (
                          <div
                            key={group.size}
                            className={cn(
                              'space-y-4',
                              isMixedContainerSizes && 'rounded-lg border border-border/60 bg-card/50 p-3',
                            )}
                          >
                            {isMixedContainerSizes ? (
                              <div className="flex items-center gap-2">
                                <Badge variant="subtle" intent="primary" size="sm">
                                  {group.size}
                                </Badge>
                                <span className="text-[10px] font-semibold text-muted-foreground">
                                  {group.quantity} container{group.quantity > 1 ? 's' : ''}
                                </span>
                              </div>
                            ) : null}

                            {/* Number of Containers */}
                            <div className="space-y-2">
                              <label className="text-[11px] font-bold text-foreground block">
                                Number of {sized}Containers *
                              </label>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateContainerGroup(group.size, { quantity: Math.max(0, group.quantity - 1) })
                                  }
                                  disabled={group.quantity <= 0}
                                  className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-foreground transition-all hover:border-primary/40 hover:bg-secondary/60 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <Minus className="h-4 w-4" />
                                </button>
                                <input
                                  type="number"
                                  min={0}
                                  inputMode="numeric"
                                  value={group.quantity}
                                  onChange={(e) =>
                                    updateContainerGroup(group.size, {
                                      quantity: Math.max(0, Number(e.target.value) || 0),
                                    })
                                  }
                                  className="w-14 shrink-0 border-0 bg-transparent text-center text-xl font-extrabold text-foreground focus:outline-none focus:ring-1 focus:ring-primary rounded-md [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => updateContainerGroup(group.size, { quantity: group.quantity + 1 })}
                                  className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-foreground transition-all hover:border-primary/40 hover:bg-secondary/60"
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                              </div>
                            </div>

                            {/* Container Number(s) */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <label className="text-[11px] font-bold text-foreground block">
                                  {sized}Container Number(s) *
                                </label>
                                <button
                                  type="button"
                                  onClick={() => openContainerNumbersUpload(group.size)}
                                  className="flex cursor-pointer items-center gap-1.5 text-[11px] font-bold text-primary hover:underline"
                                >
                                  <Upload className="w-3.5 h-3.5" />
                                  <span>Upload list</span>
                                </button>
                              </div>
                              <TagInput
                                value={group.numbers}
                                onChange={(numbers) => updateContainerGroup(group.size, { numbers })}
                                transform={(raw) => raw.toUpperCase()}
                                /* Both signals the banner below talks about,
                                   shown on the chips themselves: anything past
                                   the declared count, and any number repeated —
                                   across the other size's list too, which is
                                   why the set is computed once for the whole
                                   form rather than per field. */
                                max={group.quantity}
                                duplicates={duplicateContainerNumbers}
                                placeholder={`Type or paste ${group.size} container numbers, e.g. MSKU-998210-4`}
                              />
                              <p className="text-[10px] text-muted-foreground">
                                Press Enter or comma to add one, or paste a whole list at once.
                              </p>

                              {repeated.length > 0 && (
                                <div className="flex items-start gap-2 rounded-md bg-destructive-subtle p-2.5 text-[11px] text-destructive-subtle-foreground">
                                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                  <span>
                                    <span className="font-mono font-bold">{repeated.join(', ')}</span>{' '}
                                    {repeated.length > 1 ? 'are' : 'is'} entered more than once — every
                                    container number must be unique.
                                  </span>
                                </div>
                              )}

                              {/* Nothing declared yet is not a success — with the
                                  count at zero and no numbers the two agree, and
                                  the old branch congratulated the reader on
                                  "all 0 container numbers confirmed". */}
                              {group.quantity === 0 ? (
                                <div className="flex items-start gap-2 rounded-md bg-secondary/60 p-2.5 text-[11px] text-muted-foreground">
                                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                  <span>
                                    Set how many {sized}containers this shipment carries, then enter
                                    a number for each.
                                  </span>
                                </div>
                              ) : diff !== 0 ? (
                                <div className="flex items-start gap-2 rounded-md bg-warning-subtle p-2.5 text-[11px] text-warning-subtle-foreground">
                                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                  <span>
                                    {diff < 0
                                      ? `Add ${Math.abs(diff)} more ${sized}container number${Math.abs(diff) > 1 ? 's' : ''} to match the ${group.quantity} selected.`
                                      : `${diff} extra ${sized}container number${diff > 1 ? 's' : ''} entered — remove some or increase the count above.`}
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 rounded-md bg-success-subtle p-2.5 text-[11px] text-success-subtle-foreground">
                                  <Check className="w-3.5 h-3.5 shrink-0" />
                                  <span>
                                    All {group.quantity} {sized}container number{group.quantity > 1 ? 's' : ''} confirmed.
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5 sm:col-span-2">
                          <label className="text-[11px] font-bold text-foreground block">Shipping Line *</label>
                          <Combobox
                            value={shippingLine}
                            options={[
                              ...shippingLines.map((line) => ({
                                value: line.name,
                                label: line.name,
                                icon: (
                                  <Avatar
                                    name={line.name}
                                    src={line.logoUrl ?? undefined}
                                    fit="contain"
                                    size="xs"
                                    shape="circle"
                                  />
                                ),
                              })),
                              { value: ADD_CUSTOM_OPTION, label: '+ Add or edit lines…' },
                            ]}
                            onChange={(value) => {
                              /* The sentinel opens the manager instead of
                                 becoming the answer — a shipment booked under
                                 "__add_custom__" is not a thing. */
                              if (value === ADD_CUSTOM_OPTION) setManagingShippingLines(true);
                              else setShippingLine(value);
                            }}
                          />
                          {managingShippingLines && (
                            <ShippingLineManager
                              lines={shippingLines}
                              onClose={() => setManagingShippingLines(false)}
                              onAdded={setShippingLine}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 2. BULK CARGO SPECIFICATIONS */}
                  {shipmentCategory === 'bulk' && (
                    <div className="space-y-4 p-4 rounded-lg border border-border/60 bg-secondary/30 shadow-2xs">
                      <div className="flex items-center gap-2 text-xs font-bold text-foreground pb-1 border-b border-border/40">
                        <Layers className="w-4 h-4 text-primary" />
                        <span>Bulk Cargo Details</span>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-foreground block">Bulk Commodity Category *</label>
                        <Combobox
                          value={bulkCommodity}
                          options={[...bulkCommodityOptions, { value: ADD_CUSTOM_OPTION, label: '+ Add custom category…' }]}
                          onChange={setBulkCommodity}
                        />
                        {bulkCommodity === ADD_CUSTOM_OPTION && (
                          <div className="flex items-center gap-2 pt-1">
                            <Input
                              autoFocus
                              value={newBulkCommodityName}
                              onChange={(e) => setNewBulkCommodityName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddCustomBulkCommodity();
                                }
                              }}
                              placeholder="Type new category…"
                              className="flex-1"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleAddCustomBulkCommodity}
                              disabled={!newBulkCommodityName.trim()}
                              leadingIcon={<Plus className="w-3.5 h-3.5" />}
                            >
                              Add
                            </Button>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-foreground block">Total Weight *</label>
                        <div className="flex items-stretch overflow-hidden rounded-md border border-input bg-surface transition-all focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
                          <Input
                            type="number"
                            min={0}
                            value={displayWeight}
                            onChange={(e) => handleWeightChange(Number(e.target.value) || 0)}
                            className="min-w-0 flex-1 border-0 rounded-none hover:bg-transparent focus:border-0 focus:ring-0"
                          />
                          <div className="w-px shrink-0 bg-border" />
                          <div className="flex shrink-0">
                            {(['kg', 't'] as const).map((unit) => (
                              <button
                                key={unit}
                                type="button"
                                onClick={() => setWeightUnit(unit)}
                                className={cn(
                                  'px-3 text-xs font-bold uppercase transition-colors cursor-pointer',
                                  weightUnit === unit
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:bg-secondary/60',
                                )}
                              >
                                {unit}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 3. MACHINERY SPECIFICATIONS */}
                  {shipmentCategory === 'machinery' && (
                    <div className="space-y-4 p-4 rounded-lg border border-border/60 bg-secondary/30 shadow-2xs">
                      <div className="flex items-center gap-2 text-xs font-bold text-foreground pb-1 border-b border-border/40">
                        <Wrench className="w-4 h-4 text-primary" />
                        <span>Machinery Details</span>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-foreground block">Machinery / Equipment Type *</label>
                        <Combobox
                          value={machineryClassification}
                          options={[...machineryTypeOptions, { value: ADD_CUSTOM_OPTION, label: '+ Add custom type…' }]}
                          onChange={setMachineryClassification}
                        />
                        {machineryClassification === ADD_CUSTOM_OPTION && (
                          <div className="flex items-center gap-2 pt-1">
                            <Input
                              autoFocus
                              value={newMachineryTypeName}
                              onChange={(e) => setNewMachineryTypeName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddCustomMachineryType();
                                }
                              }}
                              placeholder="Type new equipment type…"
                              className="flex-1"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleAddCustomMachineryType}
                              disabled={!newMachineryTypeName.trim()}
                              leadingIcon={<Plus className="w-3.5 h-3.5" />}
                            >
                              Add
                            </Button>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-foreground block">Total Weight *</label>
                        <div className="flex items-stretch overflow-hidden rounded-md border border-input bg-surface transition-all focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
                          <Input
                            type="number"
                            min={0}
                            value={displayWeight}
                            onChange={(e) => handleWeightChange(Number(e.target.value) || 0)}
                            className="min-w-0 flex-1 border-0 rounded-none hover:bg-transparent focus:border-0 focus:ring-0"
                          />
                          <div className="w-px shrink-0 bg-border" />
                          <div className="flex shrink-0">
                            {(['kg', 't'] as const).map((unit) => (
                              <button
                                key={unit}
                                type="button"
                                onClick={() => setWeightUnit(unit)}
                                className={cn(
                                  'px-3 text-xs font-bold uppercase transition-colors cursor-pointer',
                                  weightUnit === unit
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:bg-secondary/60',
                                )}
                              >
                                {unit}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ─ STEP 2: Pickup, Drop-off & Fleet ─ */}
              {currentStep === 2 && (
                <div className="space-y-5">
                  {/* Pickup & Drop-off Route */}
                  <div className="space-y-4 p-4 rounded-lg border border-border/60 bg-secondary/30 shadow-2xs">
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground pb-1 border-b border-border/40">
                      <MapPin className="w-4 h-4 text-primary" />
                      <span>Pickup & Drop-off Route</span>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-foreground block">Pickup Location *</label>
                        <Combobox
                          value={pickupLocation}
                          options={[...pickupLocationOptions, { value: ADD_CUSTOM_OPTION, label: '+ Add custom location…' }]}
                          onChange={(val) => {
                            setPickupLocation(val);
                            setPickupCity('Djibouti');
                          }}
                        />
                        {pickupLocation === ADD_CUSTOM_OPTION && (
                          <div className="flex items-center gap-2 pt-1">
                            <Input
                              autoFocus
                              value={newPickupLocationName}
                              onChange={(e) => setNewPickupLocationName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddCustomPickupLocation();
                                }
                              }}
                              placeholder="Type new location…"
                              className="flex-1"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleAddCustomPickupLocation}
                              disabled={!newPickupLocationName.trim()}
                              leadingIcon={<Plus className="w-3.5 h-3.5" />}
                            >
                              Add
                            </Button>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-foreground block">Pickup Date & Time *</label>
                        <div className="flex items-stretch overflow-hidden rounded-md border border-input bg-surface transition-all focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
                          <DatePicker
                            value={pickupDate}
                            onChange={setPickupDate}
                            className="min-w-0 flex-1 border-0 rounded-none hover:bg-transparent focus:border-0 focus:ring-0"
                          />
                          <div className="w-px shrink-0 bg-border" />
                          <TimePicker
                            value={to12Hour(pickupTime)}
                            onChange={(t) => setPickupTime(to24Hour(t))}
                            className="min-w-0 flex-1 border-0 rounded-none hover:bg-transparent focus:border-0 focus:ring-0"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 pt-3 border-t border-border/40">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-foreground block">Drop-off Location *</label>
                        <Combobox
                          value={deliveryLocation}
                          options={[...dropoffLocationOptions, { value: ADD_CUSTOM_OPTION, label: '+ Add custom location…' }]}
                          onChange={(val) => {
                            setDeliveryLocation(val);
                            setDeliveryCity('Djibouti');
                            setEstimatedDistanceKm(distanceForDropoff(val));
                          }}
                        />
                        {deliveryLocation === ADD_CUSTOM_OPTION && (
                          <div className="flex items-center gap-2 pt-1">
                            <Input
                              autoFocus
                              value={newDropoffLocationName}
                              onChange={(e) => setNewDropoffLocationName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddCustomDropoffLocation();
                                }
                              }}
                              placeholder="Type new location…"
                              className="flex-1"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleAddCustomDropoffLocation}
                              disabled={!newDropoffLocationName.trim()}
                              leadingIcon={<Plus className="w-3.5 h-3.5" />}
                            >
                              Add
                            </Button>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between p-2.5 rounded-md bg-background/90 border border-border/40 text-[11px] text-muted-foreground">
                        <span>Estimated Corridor Distance:</span>
                        <span className="font-bold text-foreground">{estimatedDistanceKm} km</span>
                      </div>

                      {isContainer && (
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-foreground block">Return Date & Time *</label>
                          <div className="flex items-stretch overflow-hidden rounded-md border border-input bg-surface transition-all focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
                            <DatePicker
                              value={returnDeadline}
                              onChange={setReturnDeadline}
                              className="min-w-0 flex-1 border-0 rounded-none hover:bg-transparent focus:border-0 focus:ring-0"
                            />
                            <div className="w-px shrink-0 bg-border" />
                            <TimePicker
                              value={to12Hour(returnDeadlineTime)}
                              onChange={(t) => setReturnDeadlineTime(to24Hour(t))}
                              className="min-w-0 flex-1 border-0 rounded-none hover:bg-transparent focus:border-0 focus:ring-0"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              )}

              {/* ─ STEP 3: Transporter & Fleet ─ */}
              {currentStep === 3 && (
                <div className="space-y-5">
                  {/* The recommendation leads, because on a shipment where a
                      carrier is already holding the right empty box the answer
                      is usually one of five and hunting for it in a list of
                      forty is how that saving gets missed. The full picker is
                      one click below and never goes away. */}
                  {!manualTransporterPick ? (
                    <TransporterRecommendations
                      partners={partners}
                      line={shippingLine}
                      sizes={compatibleEmptySizes}
                      pickupAt={scheduledPickupMs}
                      vehiclesNeeded={vehiclesNeeded}
                      rateOf={(partner) => resolvePartnerRateFDJ(partner, vehicleType)}
                      considerEmpties={isContainer}
                      assignedPartnerIds={transporterAssignments
                        .map((a) => a.partnerId)
                        .filter(Boolean)}
                      onChoose={(partnerId) => {
                        assignTransporter(partnerId);
                        /* Picking one still needs its vehicle count and booking
                           numbers, so the full picker opens behind it rather
                           than leaving the operator on a dead end. */
                        setManualTransporterPick(true);
                      }}
                      onChooseManually={() => setManualTransporterPick(true)}
                    />
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setManualTransporterPick(false)}
                        className="flex cursor-pointer items-center gap-1.5 text-[11px] font-bold text-primary hover:underline"
                      >
                        <Zap className="h-3.5 w-3.5" />
                        Back to recommendations
                      </button>
                  {/* Transporters & Vehicles */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-1.5">
                      <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Truck className="h-3.5 w-3.5 text-primary" />
                        Transporters & Fleet
                      </h4>
                      <Badge variant="subtle" intent={vehicleDiff === 0 ? 'success' : 'warning'} size="sm">
                        {vehicleCount} / {vehiclesNeeded} vehicle(s)
                      </Badge>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2.5">
                        {transporterAssignments.map((a) => (
                          <div key={a.id} className="space-y-2 rounded-lg border border-border/60 p-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <Combobox
                                  value={a.partnerId}
                                  options={partners.map((p) => ({
                                    value: p.id,
                                    label: p.companyLegalName,
                                    icon: <CompanyMark id={p.id} name={p.companyLegalName} logoUrl={p.logoUrl} size="xs" />,
                                  }))}
                                  onChange={(val) => updateTransporterAssignment(a.id, { partnerId: val })}
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => removeTransporterAssignment(a.id)}
                                disabled={transporterAssignments.length === 1}
                                className="w-9 h-9 shrink-0 rounded-lg border border-border/60 text-muted-foreground hover:text-danger hover:border-danger/40 hover:bg-danger-subtle/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="w-24 space-y-1">
                              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                                Vehicles
                              </label>
                              <Input
                                type="number"
                                min={1}
                                value={a.vehicles}
                                onChange={(e) => {
                                  vehiclesTouched.current = true;
                                  updateTransporterAssignment(a.id, {
                                    vehicles: Math.max(1, Number(e.target.value) || 1),
                                  });
                                }}
                              />
                            </div>
                            {(() => {
                              const partner = partners.find((p) => p.id === a.partnerId);
                              const rate = resolvePartnerRateFDJ(partner, vehicleType);
                              return (
                                <p className="text-right text-[11px] text-muted-foreground">
                                  {rate.toLocaleString()} FDJ/vehicle · Subtotal:{' '}
                                  <span className="font-bold text-foreground">{(a.vehicles * rate).toLocaleString()} FDJ</span>
                                </p>
                              );
                            })()}
                            {(() => {
                              const entered = a.bookingIds.filter((b) => b.trim()).length;
                              return (
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                                      {isDpcsSource ? 'DPCS Booking ID(s) *' : 'Booking Number(s) *'}
                                    </label>
                                    <Badge
                                      variant="subtle"
                                      intent={entered === a.vehicles ? 'success' : 'warning'}
                                      size="sm"
                                    >
                                      {entered} / {a.vehicles}
                                    </Badge>
                                  </div>
                                  <TagInput
                                    value={a.bookingIds}
                                    onChange={(ids) => handleBookingIdsChange(a.id, ids)}
                                    transform={(raw) => raw.toUpperCase()}
                                    placeholder={
                                      isDpcsSource
                                        ? "Type or paste this transporter's DPCS booking ID(s)"
                                        : 'Type one booking number per vehicle, in load order'
                                    }
                                  />
                                  <p className="text-[10px] text-muted-foreground">
                                    One per vehicle — each is a booking, and they are matched to the container
                                    numbers in the order entered.
                                  </p>
                                </div>
                              );
                            })()}
                          </div>
                        ))}
                      </div>

                      {vehicleDiff !== 0 ? (
                        <div className="flex items-start gap-2 rounded-md bg-warning-subtle p-2.5 text-[11px] text-warning-subtle-foreground">
                          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>
                            {vehicleDiff < 0
                              ? `Add ${Math.abs(vehicleDiff)} more vehicle${Math.abs(vehicleDiff) > 1 ? 's' : ''} to match the ${vehiclesNeeded} needed.`
                              : `${vehicleDiff} extra vehicle${vehicleDiff > 1 ? 's' : ''} assigned — remove some or increase what's needed.`}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 rounded-md bg-success-subtle p-2.5 text-[11px] text-success-subtle-foreground">
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span>All {vehiclesNeeded} vehicle{vehiclesNeeded > 1 ? 's' : ''} needed assigned.</span>
                        </div>
                      )}

                      {referenceFieldsMissing && (
                        <div className="flex items-start gap-2 rounded-md bg-warning-subtle p-2.5 text-[11px] text-warning-subtle-foreground">
                          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>
                            {shipmentReferenceMissing
                              ? isDpcsSource
                                ? 'Enter the DPCS Shipment ID in step 1, and one booking number per vehicle here.'
                                : 'Enter the shipment number in step 1, and one booking number per vehicle here.'
                              : bookingNumbersLong.length > 0
                                ? 'Remove the extra booking number(s) — there is one per vehicle.'
                                : 'Enter a booking number for every vehicle — one per container.'}
                          </span>
                        </div>
                      )}

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={addTransporterAssignment}
                        leadingIcon={<Plus className="w-3.5 h-3.5" />}
                      >
                        Add Transporter
                      </Button>

                      {/* The one thing Empty Container Management knows that this
                          wizard cannot work out for itself: which of these
                          carriers is already sitting on a box this job could
                          use. Container shipments only — bulk and machinery have
                          no container to reuse. */}
                      {isContainer && (
                        <EmptyContainerOpportunities
                          line={shippingLine}
                          sizes={compatibleEmptySizes}
                          pickupAt={scheduledPickupMs}
                          vehiclesNeeded={vehiclesNeeded}
                          assignedPartnerIds={transporterAssignments
                            .map((a) => a.partnerId)
                            .filter(Boolean)}
                          selectedEmptyIds={pairedEmptyIds}
                          onSelectTransporter={assignTransporter}
                          onToggleEmpty={(bookingId) =>
                            setPairedEmptyIds((prev) =>
                              prev.includes(bookingId)
                                ? prev.filter((id) => id !== bookingId)
                                : [...prev, bookingId],
                            )
                          }
                        />
                      )}
                    </div>
                  </div>
                    </>
                  )}
                </div>
              )}

              {/* ─ STEP 4: Pricing & Review ─ */}
              {currentStep === 4 && (
                <div className="space-y-6">
                  {/* Summary */}
                  <div className="space-y-3">
                    <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Summary</h4>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Shipper</span>
                        <div className="text-sm font-bold text-foreground">{activeShipper?.company ?? '—'}</div>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Cargo</span>
                        <div className="text-sm font-bold text-foreground">{getResolvedCargoLabel()}</div>
                      </div>
                      <div className="col-span-2 space-y-0.5">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Route</span>
                        <div className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                          <span>{pickupLocation.split('—')[0]?.trim()}</span>
                          <span className="text-muted-foreground">→</span>
                          <span>{deliveryLocation.split('—')[0]?.trim()}</span>
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Vehicles</span>
                        <div className="text-sm font-bold text-foreground">{vehicleCount} vehicle(s)</div>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Payment</span>
                        <Badge variant="subtle" intent={paymentStatus === 'Paid' ? 'success' : 'warning'} size="sm">
                          {paymentStatus}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 border-t border-border pt-5">
                    <div className="space-y-1 rounded-lg border border-primary/15 bg-primary-subtle p-4">
                      <span className="text-[10px] font-bold text-primary-subtle-foreground uppercase tracking-wider">
                        Shipment Price — what the shipper is billed
                      </span>
                      <div className="text-2xl font-extrabold text-foreground">
                        {totalCostFDJ.toLocaleString()} FDJ
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {vehicleCount} × per-mission price from {transporterAssignments.length === 1 ? "the transporter's" : "each transporter's"} own price
                        list{transporterAssignments.length !== 1 ? ` · ${transporterAssignments.length} transporters` : ''}
                      </p>
                    </div>

                    {/* An override, never a blank to fill in. The price is
                        always resolved from the price list, so leaving this
                        alone can no longer produce an unpriced shipment —
                        which is what used to strand shipments in Finance. */}
                    {overridePrice ? (
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-foreground block">Negotiated price for this shipment</label>
                        <Input
                          type="number"
                          min={0}
                          value={clientRateInput}
                          onChange={(e) => setClientRateInput(e.target.value)}
                          placeholder={String(totalCostFDJ)}
                          suffixText="FDJ"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setOverridePrice(false);
                            setClientRateInput('');
                          }}
                          className="text-[10px] font-bold text-primary underline-offset-2 hover:underline"
                        >
                          Use the price list instead
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setOverridePrice(true)}
                        className="text-[11px] font-bold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      >
                        Override with a negotiated price
                      </button>
                    )}

                  </div>
                </div>
              )}
            </div>
            </div>

            {/* ── VALIDATION / SUBMIT ERROR ── */}
            {currentStep === STEPS.length && (validationIssues.length > 0 || submitError) && (
              <div className="shrink-0 space-y-2 border-t border-border/40 px-6 py-3 sm:px-8">
                {submitError ? (
                  <div className="flex items-start gap-2 rounded-md bg-danger-subtle p-2.5 text-[11px] text-danger-subtle-foreground">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{submitError}</span>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 rounded-md bg-warning-subtle p-2.5 text-[11px] text-warning-subtle-foreground">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-bold">Before you can create this shipment:</p>
                      <ul className="space-y-1">
                        {validationIssues.map((issue) => (
                          <li key={issue.text}>
                            <button
                              type="button"
                              onClick={() => setCurrentStep(issue.step)}
                              className="flex w-full items-start gap-1.5 text-left underline-offset-2 hover:underline cursor-pointer"
                            >
                              <span className="shrink-0 rounded-sm bg-warning-subtle-foreground/15 px-1 py-px font-bold">
                                {STEPS[issue.step - 1]?.shortTitle}
                              </span>
                              <span>{issue.text}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── STICKY FOOTER ── */}
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/40 bg-background px-6 py-4 sm:px-8">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleBack}
                className="rounded-lg"
              >
                Back
              </Button>

              {currentStep < STEPS.length ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleNext}
                  className="rounded-lg bg-primary px-5 font-semibold text-primary-foreground"
                >
                  Next Step
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleCreateShipment}
                  disabled={!canSubmit || createShipmentMutation.isPending}
                  isLoading={createShipmentMutation.isPending}
                  className="gap-1.5 rounded-lg bg-primary px-5 font-semibold text-primary-foreground"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Confirm & Create
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
