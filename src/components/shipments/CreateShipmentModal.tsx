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
  Info,
  Check,
  Layers,
  Wrench,
  Upload,
  Plus,
  Minus,
  Trash2,
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
  Checkbox,
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/design-system';
import { useShipmentStore } from '@/stores/shipment.store';
import { useFinanceStore } from '@/stores/finance.store';
import { ROUTES, buildPath } from '@/config/routes';
import { useShippers } from '@/features/shippers/api/queries';
import { usePartners } from '@/features/partners/api/queries';
import { useCreateShipment } from '@/features/shipments/api/queries';
import { USD_TO_DJF } from '@/features/transporter-bi/config';
import { setProjectLink } from '@/lib/operations/shipmentProjectLink';
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
  const amount = match.currency === 'USD' ? match.basePrice * USD_TO_DJF : match.basePrice;
  return Math.round(amount);
}

// ─── Static data ─────────────────────────────────────────────────────────────

export const CONTAINER_SIZES = [
  { value: '40ft', label: '40ft', desc: 'Standard Dry Container' },
  { value: '20ft', label: '20ft', desc: 'Standard Dry Container' },
] as const;

export type ContainerSizeType = (typeof CONTAINER_SIZES)[number]['value'];

// Pickup locations: ONLY Djibouti Ports
export const PICKUP_LOCATION_OPTIONS = [
  { value: 'Doraleh Container Terminal (DCT) — Port of Doraleh, Djibouti', label: 'Doraleh Container Terminal (DCT) — Port of Doraleh' },
  { value: 'Djibouti Multipurpose Port (DMP) — Doraleh Port, Djibouti', label: 'Djibouti Multipurpose Port (DMP) — Doraleh Port' },
  { value: 'Société de Gestion du Terminal à Conteneurs de Doraleh (SGTD Port)', label: 'Société de Gestion du Terminal à Conteneurs de Doraleh (SGTD Port)' },
  { value: 'Port of Djibouti (PAID Gate 4) — Commercial Port', label: 'Port of Djibouti (PAID Gate 4) — Commercial Port' },
  { value: 'Horizon Djibouti Terminals (HDTL) — Doraleh Petroleum Port', label: 'Horizon Djibouti Terminals (HDTL) — Doraleh Petroleum Port' },
  { value: 'Port of Tadjourah — Bulk & General Cargo Port', label: 'Port of Tadjourah — Bulk & General Cargo Port' },
  { value: 'Damerjog Livestock & Industrial Port, Djibouti', label: 'Damerjog Livestock & Industrial Port' },
  { value: 'Port of Ghoubet — Mineral Export Port', label: 'Port of Ghoubet — Mineral Export Port' },
];

// Drop-off locations: ONLY Djibouti Free Zones
export const DROPOFF_LOCATION_OPTIONS = [
  { value: 'Djibouti International Free Trade Zone (DIFTZ) — PK12 Freezone', label: 'Djibouti International Free Trade Zone (DIFTZ) — PK12 Freezone' },
  { value: 'Djibouti Free Zone (DFZ) — Port Corridor Freezone', label: 'Djibouti Free Zone (DFZ) — Port Corridor Freezone' },
  { value: 'Damerjog Free Zone — Livestock & Industrial Park, Djibouti', label: 'Damerjog Free Zone — Livestock & Industrial Park' },
  { value: 'Nagad Free Zone — Inland Container Depot, Djibouti', label: 'Nagad Free Zone — Inland Container Depot' },
  { value: 'Holhol Free Zone — Logistics & Distribution Park, Djibouti', label: 'Holhol Free Zone — Logistics & Distribution Park' },
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

const SHIPPING_LINES = [
  'Maersk Line', 'MSC Shipping', 'CMA CGM',
  'Pacific International Lines (PIL)', 'COSCO Shipping',
  'Ocean Network Express (ONE)', 'Hapag-Lloyd',
];

const DOCUMENT_OPTIONS = [
  'DPCS Clearance',
  'Bill of Lading',
  'Certificate of Origin',
  'Commercial Invoice',
  'Packing List',
  'Insurance Certificate',
];

// Custom document types the user adds are remembered locally, so a document
// typed once shows up as a plain checkbox on every later shipment.
const CUSTOM_DOCUMENTS_STORAGE_KEY = 'fleetin.customRequiredDocuments';

function loadCustomDocuments(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_DOCUMENTS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === 'string') : [];
  } catch {
    return [];
  }
}

function saveCustomDocuments(docs: string[]): void {
  try {
    localStorage.setItem(CUSTOM_DOCUMENTS_STORAGE_KEY, JSON.stringify(docs));
  } catch {
    // Storage unavailable (private browsing, quota) — the session still works, it just won't persist.
  }
}

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
    title: 'Pickup, Drop-off & Fleet',
    shortTitle: 'Route',
    description: 'Pickup, drop-off, and vehicle assignment.',
    icon: Truck,
  },
  {
    id: 3,
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

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [successToast, setSuccessToast] = useState<{ id: string; bookingId: string } | null>(null);

  // Form Fields State: Category (Container, Bulk, Machinery)
  const [shipmentCategory, setShipmentCategory] = useState<'containerized' | 'bulk' | 'machinery'>('containerized');

  // Container Specifics: 40ft, 20ft
  const [containerSize, setContainerSize] = useState<ContainerSizeType>('40ft');
  const [shippingLine, setShippingLine] = useState<string>('Maersk Line');
  const [containerQuantity, setContainerQuantity] = useState<number>(1);
  const [containerNumbers, setContainerNumbers] = useState<string[]>(['MSKU-998210-4']);

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
  const [pickupLocation, setPickupLocation] = useState<string>(PICKUP_LOCATION_OPTIONS[0]?.value ?? 'Doraleh Container Terminal (DCT) — Port of Doraleh, Djibouti');
  const [pickupCity, setPickupCity] = useState<string>('Doraleh Port, Djibouti');
  const [pickupDate, setPickupDate] = useState<string>('2026-07-29');
  const [pickupTime, setPickupTime] = useState<string>('08:30');
  const [customPickupLocations, setCustomPickupLocations] = useState<string[]>(() => loadCustomPickupLocations());
  const [newPickupLocationName, setNewPickupLocationName] = useState<string>('');
  const pickupLocationOptions = [
    ...PICKUP_LOCATION_OPTIONS,
    ...customPickupLocations.map((l) => ({ value: l, label: l })),
  ];
  const [deliveryLocation, setDeliveryLocation] = useState<string>(DROPOFF_LOCATION_OPTIONS[0]?.value ?? 'Djibouti International Free Trade Zone (DIFTZ) — PK12 Freezone');
  const [deliveryCity, setDeliveryCity] = useState<string>('PK12 Freezone, Djibouti');
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

  // Which of the shipper's open finance projects this shipment belongs to,
  // if any — '' means a one-off. The Finance module has no backend of its
  // own yet, so this tag is recorded locally (see `shipmentProjectLink`)
  // rather than sent to the shipment API.
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const financeProjects = useFinanceStore((state) => state.projects);
  const clientProjects = useMemo(
    () =>
      financeProjects.filter(
        (project) => project.clientId === selectedShipperId && project.status === 'active',
      ),
    [financeProjects, selectedShipperId],
  );
  useEffect(() => {
    setSelectedProjectId('');
  }, [selectedShipperId]);

  // Fleet
  const [vehicleType, setVehicleType] = useState<string>('Container Chassis Skeleton Carrier (40ft)');
  const [transporterAssignments, setTransporterAssignments] = useState<
    { id: string; partnerId: string; vehicles: number; bookingIds: string[] }[]
  >([{ id: 'TA-1', partnerId: '', vehicles: 3, bookingIds: [] }]);
  const transporterIdCounter = useRef(1);

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
  const [requiredDocuments, setRequiredDocuments] = useState<string[]>(['DPCS Clearance', 'Bill of Lading']);
  const [customDocuments, setCustomDocuments] = useState<string[]>(() => loadCustomDocuments());
  const [newDocumentName, setNewDocumentName] = useState<string>('');
  const [dpcsReference, setDpcsReference] = useState<string>('DPCS-DJ-2026-9901');
  const documentOptions = [...DOCUMENT_OPTIONS, ...customDocuments];

  const resolveVehicleType = (size: ContainerSizeType, quantity: number): string => {
    return quantity > 1
      ? `Multi-Container Chassis Trailer (${quantity}x ${size})`
      : `Container Chassis Skeleton Carrier (${size})`;
  };

  const handleContainerNumbersChange = (numbers: string[]) => {
    setContainerNumbers(numbers);
  };

  const handleBookingIdsChange = (assignmentId: string, ids: string[]) => {
    updateTransporterAssignment(assignmentId, { bookingIds: ids });
  };

  const handleContainerQuantitySelect = (quantity: number) => {
    setContainerQuantity(quantity);
    setVehicleType(resolveVehicleType(containerSize, quantity));
  };

  const containerFileInputRef = useRef<HTMLInputElement>(null);

  const handleContainerNumbersFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const numbers = text
        .split(/[\r\n,;]+/)
        .map((n) => n.trim().toUpperCase())
        .filter(Boolean);
      if (numbers.length > 0) {
        setContainerNumbers(numbers);
        setContainerQuantity(numbers.length);
        setVehicleType(resolveVehicleType(containerSize, numbers.length));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Sync category changes with default vehicle types
  const handleCategorySelect = (category: 'containerized' | 'bulk' | 'machinery') => {
    setShipmentCategory(category);
    if (category === 'containerized') {
      setVehicleType(resolveVehicleType(containerSize, containerQuantity));
    } else if (category === 'bulk') {
      setVehicleType('Heavy Tipper Bulk Truck (Side/Rear Dump)');
    } else if (category === 'machinery') {
      setVehicleType('Heavy Lowbed Equipment Transport Trailer + Escort');
    }
  };

  const handleContainerSizeSelect = (size: ContainerSizeType) => {
    setContainerSize(size);
    setVehicleType(resolveVehicleType(size, containerQuantity));
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
      if (prefillData.cargoType) {
        setContainerSize(prefillData.cargoType.includes('20') ? '20ft' : '40ft');
      }
      if (prefillData.totalWeightKg) setTotalWeightKg(prefillData.totalWeightKg);
      if (prefillData.containerNumber) {
        setContainerNumbers([prefillData.containerNumber]);
        setContainerQuantity(1);
      }
    }
  }, [prefillData, sampleShippers]);

  // Reset state when closed
  const handleClose = () => {
    closeCreateModal();
    setCurrentStep(1);
    setCompletedSteps([]);
    setSuccessToast(null);
    setShipmentSource(null);
  };

  const isContainer = shipmentCategory === 'containerized';
  const containerNumberDiff = containerNumbers.length - containerQuantity;

  const activeShipper = sampleShippers.find((s) => s.id === selectedShipperId);

  const vehicleCount = transporterAssignments.reduce((sum, a) => sum + a.vehicles, 0);
  // One vehicle per container; bulk/machinery shipments default to a single dedicated vehicle.
  const vehiclesNeeded = isContainer ? containerQuantity : 1;
  const vehicleDiff = vehicleCount - vehiclesNeeded;
  const dpcsFieldsMissing =
    isDpcsSource && (!dpcsReference.trim() || transporterAssignments.some((a) => a.bookingIds.length === 0));
  const totalCostFDJ = transporterAssignments.reduce((sum, a) => {
    const partner = partners.find((p) => p.id === a.partnerId);
    return sum + a.vehicles * resolvePartnerRateFDJ(partner, vehicleType);
  }, 0);

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

  const toggleRequiredDocument = (doc: string) => {
    setRequiredDocuments((prev) => (prev.includes(doc) ? prev.filter((d) => d !== doc) : [...prev, doc]));
  };

  const handleAddCustomDocument = () => {
    const trimmed = newDocumentName.trim();
    if (!trimmed) return;
    const alreadyKnown = documentOptions.some((d) => d.toLowerCase() === trimmed.toLowerCase());
    if (!alreadyKnown) {
      const next = [...customDocuments, trimmed];
      setCustomDocuments(next);
      saveCustomDocuments(next);
    }
    setRequiredDocuments((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setNewDocumentName('');
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

  // DPCS only moves containers, and the port settles payment on its own —
  // so a DPCS shipment always starts out Container / Paid, non-negotiably.
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

  const getResolvedCargoLabel = (): string => {
    if (isContainer) {
      return `Container (${containerSize})`;
    }
    if (shipmentCategory === 'bulk') {
      const commodityName = bulkCommodity.split('(')[0]?.trim() || bulkCommodity;
      return `Bulk Cargo (${commodityName})`;
    }
    const machineryName = machineryClassification.split('(')[0]?.trim() || machineryClassification;
    return `Machinery (${machineryName})`;
  };

  const canSubmit = Boolean(activeShipper) && transporterAssignments.every((a) => a.partnerId);

  const handleCreateShipment = async () => {
    if (!activeShipper || !canSubmit) return;

    const resolvedContainerNumber = isContainer ? containerNumbers.filter(Boolean).join(', ') : undefined;
    const scheduledPickupTimeIso = new Date(`${pickupDate}T${pickupTime}:00`).toISOString();
    const containerReturnDeadlineIso = isContainer
      ? new Date(`${returnDeadline}T${returnDeadlineTime}:00`).toISOString()
      : undefined;

    const created = await createShipmentMutation.mutateAsync({
      shipmentSource: shipmentSource ?? 'custom',
      dpcsReference: isDpcsSource ? dpcsReference.trim() : undefined,
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
      requiredDocuments: requiredDocuments.length > 0 ? requiredDocuments : undefined,
      bulkCommodity: shipmentCategory === 'bulk' ? bulkCommodity : undefined,
      containerNumber: resolvedContainerNumber,
      shippingLine: isContainer ? shippingLine : undefined,
      containerReturnDepot: isContainer ? deliveryLocation : undefined,
      containerReturnDeadline: containerReturnDeadlineIso,
      containerReturnFreeDays: isContainer ? freeDays : undefined,
      goodsDescription:
        isContainer
          ? `Container Cargo (${containerSize})`
          : shipmentCategory === 'bulk'
          ? bulkCommodity
          : machineryClassification,
      totalWeightKg: totalWeightKg,
      paymentStatus,
      scheduledPickupTime: scheduledPickupTimeIso,
    });

    addShipment(created);
    if (selectedProjectId) setProjectLink(created.id, selectedProjectId);
    setSuccessToast({ id: created.id, bookingId: created.bookingId });
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
                  <span>Added to Empty Return Matching as an open full load</span>
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
              <p className="text-xs text-muted-foreground">This decides who assigns the Shipment ID and Booking ID.</p>
            </div>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => handleChooseSource('dpcs')}
                className="flex w-full cursor-pointer flex-col items-center gap-3 rounded-lg border border-border bg-card px-4 py-7 text-center transition-all hover:border-primary/30 hover:bg-secondary/40"
              >
                <div className="text-sm font-bold text-foreground">Shipment from DPCS</div>
                <img src="/logo/dpcs-logo.png" alt="DPCS" className="h-12 w-auto object-contain" />
                <p className="text-xs text-muted-foreground">DPCS already assigned the IDs — you enter them.</p>
              </button>

              <button
                type="button"
                onClick={() => handleChooseSource('custom')}
                className="flex w-full cursor-pointer flex-col items-center gap-3 rounded-lg border border-border bg-card px-4 py-7 text-center transition-all hover:border-primary/30 hover:bg-secondary/40"
              >
                <div className="text-sm font-bold text-foreground">Custom Shipment</div>
                <img src="/logo/fleetin-wordmark.png" alt="FLEETIN" className="h-12 w-auto object-contain" />
                <p className="text-xs text-muted-foreground">Fleetin assigns the IDs automatically.</p>
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
                  {/* Shipper / Exporting Entity */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                      Shipper / Exporting Entity *
                    </label>
                    <Combobox
                      value={selectedShipperId}
                      options={sampleShippers.map((s) => ({
                        value: s.id,
                        label: `${s.company} — ${s.name}`,
                        icon: <Avatar name={s.company} size="xs" shape="circle" />,
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
                      ]}
                      onChange={setSelectedProjectId}
                    />
                    {selectedShipperId && clientProjects.length === 0 ? (
                      <p className="text-[11px] font-medium text-muted-foreground">
                        No open finance projects for this shipper — this will book as a one-off shipment.
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
                      {/* Container Size Selection: 40ft, 20ft */}
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-foreground block">
                          Container Size *
                        </label>
                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                          {CONTAINER_SIZES.map((size) => {
                            const isSelected = containerSize === size.value;
                            return (
                              <button
                                key={size.value}
                                type="button"
                                onClick={() => handleContainerSizeSelect(size.value)}
                                className={cn(
                                  'flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-left transition-all',
                                  isSelected
                                    ? 'border-primary bg-primary text-primary-foreground shadow-xs ring-1 ring-primary'
                                    : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-secondary/60'
                                )}
                              >
                                <div className="flex items-center justify-between w-full">
                                  <span className="text-xs font-bold">{size.label}</span>
                                  <Container className={cn('h-4 w-4 shrink-0', isSelected ? 'text-primary-foreground' : 'text-primary')} />
                                </div>
                                <span className={cn('text-[10px] leading-tight', isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                                  {size.desc}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Number of Containers */}
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-foreground block">
                          Number of Containers *
                        </label>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleContainerQuantitySelect(Math.max(1, containerQuantity - 1))}
                            disabled={containerQuantity <= 1}
                            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-foreground transition-all hover:border-primary/40 hover:bg-secondary/60 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <input
                            type="number"
                            min={1}
                            inputMode="numeric"
                            value={containerQuantity}
                            onChange={(e) => handleContainerQuantitySelect(Math.max(1, Number(e.target.value) || 1))}
                            className="w-14 shrink-0 border-0 bg-transparent text-center text-xl font-extrabold text-foreground focus:outline-none focus:ring-1 focus:ring-primary rounded-md [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleContainerQuantitySelect(containerQuantity + 1)}
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
                            Container Number(s) *
                          </label>
                          <button
                            type="button"
                            onClick={() => containerFileInputRef.current?.click()}
                            className="flex items-center gap-1.5 text-[11px] font-bold text-primary hover:underline"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>Upload list</span>
                          </button>
                          <input
                            ref={containerFileInputRef}
                            type="file"
                            accept=".csv,.txt,text/csv,text/plain"
                            className="hidden"
                            onChange={handleContainerNumbersFileUpload}
                          />
                        </div>
                        <TagInput
                          value={containerNumbers}
                          onChange={handleContainerNumbersChange}
                          transform={(raw) => raw.toUpperCase()}
                          placeholder="Type or paste container numbers, e.g. MSKU-998210-4"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Press Enter or comma to add one, or paste a whole list at once.
                        </p>

                        {containerNumberDiff !== 0 ? (
                          <div className="flex items-start gap-2 rounded-md bg-warning-subtle p-2.5 text-[11px] text-warning-subtle-foreground">
                            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>
                              {containerNumberDiff < 0
                                ? `Add ${Math.abs(containerNumberDiff)} more container number${Math.abs(containerNumberDiff) > 1 ? 's' : ''} to match the ${containerQuantity} container${containerQuantity > 1 ? 's' : ''} selected.`
                                : `${containerNumberDiff} extra container number${containerNumberDiff > 1 ? 's' : ''} entered — remove some or increase the count above.`}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 rounded-md bg-success-subtle p-2.5 text-[11px] text-success-subtle-foreground">
                            <Check className="w-3.5 h-3.5 shrink-0" />
                            <span>All {containerQuantity} container number{containerQuantity > 1 ? 's' : ''} confirmed.</span>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5 sm:col-span-2">
                          <label className="text-[11px] font-bold text-foreground block">Shipping Line *</label>
                          <Combobox
                            value={shippingLine}
                            options={SHIPPING_LINES.map((l) => ({
                              value: l,
                              label: l,
                              icon: <Avatar name={l} size="xs" shape="circle" />,
                            }))}
                            onChange={setShippingLine}
                          />
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
                            if (val.includes('Tadjourah')) {
                              setPickupCity('Port of Tadjourah, Djibouti');
                            } else if (val.includes('Damerjog')) {
                              setPickupCity('Damerjog Freezone, Djibouti');
                            } else if (val.includes('Ghoubet')) {
                              setPickupCity('Port of Ghoubet, Djibouti');
                            } else {
                              setPickupCity('Doraleh Port, Djibouti');
                            }
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
                            if (val.includes('DIFTZ')) {
                              setDeliveryCity('PK12 Freezone, Djibouti');
                              setEstimatedDistanceKm(25);
                            } else if (val.includes('Djibouti Free Zone (DFZ)')) {
                              setDeliveryCity('Port Corridor Freezone, Djibouti');
                              setEstimatedDistanceKm(15);
                            } else if (val.includes('Damerjog')) {
                              setDeliveryCity('Damerjog Freezone, Djibouti');
                              setEstimatedDistanceKm(20);
                            } else if (val.includes('Nagad')) {
                              setDeliveryCity('Nagad Freezone, Djibouti');
                              setEstimatedDistanceKm(12);
                            } else if (val.includes('Holhol')) {
                              setDeliveryCity('Holhol Freezone, Djibouti');
                              setEstimatedDistanceKm(35);
                            } else {
                              setDeliveryCity('Djibouti Free Zone, Djibouti');
                              setEstimatedDistanceKm(20);
                            }
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
                      {isDpcsSource && (
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-foreground block">DPCS Shipment ID *</label>
                          <Input
                            value={dpcsReference}
                            onChange={(e) => setDpcsReference(e.target.value)}
                            placeholder="DPCS-DJ-2026-9901"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            The Shipment ID DPCS already generated for this booking — Fleetin will not create a new one.
                          </p>
                        </div>
                      )}
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
                                    icon: <Avatar name={p.companyLegalName} size="xs" shape="circle" />,
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
                                onChange={(e) =>
                                  updateTransporterAssignment(a.id, { vehicles: Math.max(1, Number(e.target.value) || 1) })
                                }
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
                            {isDpcsSource && (
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                                  DPCS Booking ID(s) *
                                </label>
                                <TagInput
                                  value={a.bookingIds}
                                  onChange={(ids) => handleBookingIdsChange(a.id, ids)}
                                  transform={(raw) => raw.toUpperCase()}
                                  placeholder="Type or paste this transporter's DPCS booking ID(s)"
                                />
                              </div>
                            )}
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

                      {dpcsFieldsMissing && (
                        <div className="flex items-start gap-2 rounded-md bg-warning-subtle p-2.5 text-[11px] text-warning-subtle-foreground">
                          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>Enter the DPCS Shipment ID and each transporter's Booking ID(s) before continuing.</span>
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

                      <div className="space-y-1.5 pt-1">
                        <label className="text-[11px] font-bold text-foreground block">Preferred Vehicle Type *</label>
                        <Combobox
                          value={vehicleType}
                          options={[
                            { value: 'Container Chassis Skeleton Carrier (40ft)', label: 'Container Chassis Skeleton Carrier (40ft)' },
                            { value: 'Container Chassis Skeleton Carrier (20ft)', label: 'Container Chassis Skeleton Carrier (20ft)' },
                            { value: 'Dual Container Chassis Trailer (2x 20ft)', label: 'Dual Container Chassis Trailer (2x 20ft)' },
                            { value: 'Heavy Truck (Flatbed 40ft)', label: 'Heavy Truck (Flatbed 40ft)' },
                            { value: 'Heavy Tipper Bulk Truck (Side/Rear Dump)', label: 'Heavy Tipper Bulk Truck (Side/Rear Dump)' },
                            { value: 'Pneumatic Tanker Bulk Truck', label: 'Pneumatic Tanker Bulk Truck (Cement / Flour / Grain)' },
                            { value: 'Heavy Lowbed Equipment Transport Trailer + Escort', label: 'Heavy Lowbed Equipment Transport Trailer + Escort' },
                            { value: 'Multi-Axle Modular Transporter (SPMT)', label: 'Multi-Axle Modular Transporter (SPMT)' },
                            { value: 'Refrigerated Box Truck (Reefer)', label: 'Refrigerated Box Truck (Reefer)' },
                          ]}
                          onChange={setVehicleType}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ─ STEP 3: Pricing & Review ─ */}
              {currentStep === 3 && (
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
                        Total Shipment Freight
                      </span>
                      <div className="text-2xl font-extrabold text-foreground">
                        {totalCostFDJ.toLocaleString()} FDJ
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {vehicleCount} vehicle(s) across {transporterAssignments.length} transporter{transporterAssignments.length !== 1 ? 's' : ''} · rates from each transporter's pricing grid
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-foreground block">Payment Status *</label>
                      {isDpcsSource ? (
                        <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success-subtle px-4 py-2.5 text-sm font-bold text-success-subtle-foreground">
                          <Check className="h-4 w-4 shrink-0" />
                          <span>Paid — settled automatically via DPCS</span>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2.5">
                          {(['Pending', 'Paid'] as const).map((status) => {
                            const isSelected = paymentStatus === status;
                            return (
                              <button
                                key={status}
                                type="button"
                                onClick={() => setPaymentStatus(status)}
                                className={cn(
                                  'cursor-pointer rounded-lg border px-4 py-2.5 text-sm font-bold transition-all',
                                  isSelected
                                    ? 'border-primary bg-primary text-primary-foreground shadow-xs ring-1 ring-primary'
                                    : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-secondary/60',
                                )}
                              >
                                {status}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-foreground block">Required Documents *</label>
                      <div className="space-y-3 rounded-lg border border-border/60 p-3">
                        <div className="space-y-2.5">
                          {documentOptions.map((doc) => (
                            <div key={doc}>
                              <Checkbox
                                label={doc}
                                checked={requiredDocuments.includes(doc)}
                                onChange={() => toggleRequiredDocument(doc)}
                              />
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 border-t border-border/60 pt-3">
                          <Input
                            value={newDocumentName}
                            onChange={(e) => setNewDocumentName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddCustomDocument();
                              }
                            }}
                            placeholder="Add a custom document…"
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleAddCustomDocument}
                            disabled={!newDocumentName.trim()}
                            leadingIcon={<Plus className="w-3.5 h-3.5" />}
                          >
                            Add
                          </Button>
                        </div>
                      </div>
                    </div>

                    {!isDpcsSource && requiredDocuments.includes('DPCS Clearance') && (
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-foreground block">DPCS Document Ref</label>
                        <Input
                          value={dpcsReference}
                          onChange={(e) => setDpcsReference(e.target.value)}
                          placeholder="DPCS-DJ-2026-9901"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            </div>

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
