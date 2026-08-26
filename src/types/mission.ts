export type MissionStatus =
  | 'Pending'
  | 'Payment Pending'
  | 'Assigned'
  | 'Driver Assigned'
  | 'Heading to Pickup'
  | 'At Pickup'
  | 'Loading'
  | 'Loaded'
  | 'En Route'
  | 'Arrived'
  | 'Unloading'
  | 'POD Submitted'
  | 'Empty Ready'
  | 'Completed'
  | 'Cancelled'
  | 'Failed';

export type MissionPaymentStatus = 'Paid' | 'Pending' | 'Overdue' | 'Partially Paid';

export interface MissionTimelineStep {
  id: string;
  key:
    | 'creation'
    | 'booking_confirmation'
    | 'vehicle_assignment'
    | 'driver_assignment'
    | 'left_for_pickup'
    | 'gate_in'
    | 'loading_start'
    | 'pickup'
    | 'departure'
    | 'arrival'
    | 'unloading_start'
    | 'pod_upload'
    | 'empty_ready'
    | 'completion';
  title: string;
  description: string;
  timestamp?: string;
  status: 'completed' | 'current' | 'pending' | 'failed' | 'skipped';
  actor?: string;
  location?: string;
  podFileUrl?: string;
  notes?: string;
}

export interface CustomerInfo {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  rating: number;
}

export interface TransporterInfo {
  id: string;
  name: string;
  company: string;
  phone: string;
  fleetCode: string;
  rating: number;
}

export interface DriverInfo {
  id: string;
  name: string;
  phone: string;
  licenseNumber: string;
  rating: number;
  isVerified: boolean;
}

export interface TruckInfo {
  id: string;
  registrationNumber: string;
  vehicleType: string;
  capacity: string;
  isVerified: boolean;
}

export interface LocationInfo {
  name: string;
  address: string;
  city: string;
  gateOrTerminal?: string;
  contactPerson?: string;
  contactPhone?: string;
}

/**
 * The container-return commitment captured at booking time.
 *
 * Collected by the Create Shipment wizard for containerized loads and read by
 * the Empty Return module when the delivered box becomes an empty to return —
 * this is how a shipment-derived empty arrives with a deadline instead of the
 * "deadline missing" exception.
 */
export interface ContainerReturnInfo {
  depot: string;
  /** `YYYY-MM-DD HH:mm`, same local format as every other Mission timestamp. */
  deadline: string;
  freeDays: number;
}

export interface Mission {
  id: string; // e.g. MSN-08801
  bookingId: string; // e.g. BKG-01178
  referenceNumber: string; // e.g. REF-99201
  /** DPCS's own id for this shipment. Empty for a Fleetin-direct one — it genuinely has none. */
  dpcsReference: string; // e.g. DPCS-DJ-7731
  /**
   * Where the shipment came from. The origination channel is this field and
   * only this field — `dpcsReference` used to carry a random fallback for
   * Fleetin-direct shipments too, so testing it for truthiness badged every
   * shipment as DPCS.
   */
  source: 'dpcs' | 'custom';
  status: MissionStatus;
  paymentStatus: MissionPaymentStatus;

  // Entity relations — ids join to ShipperRecord (customer) and PartnerRecord
  // (transporter), so detail pages and the Empty Return module can follow them.
  customer: CustomerInfo;
  transporter: TransporterInfo;
  driver?: DriverInfo;
  assignedTruck?: TruckInfo;

  // Route & Logistics
  pickupLocation: LocationInfo;
  deliveryLocation: LocationInfo;
  estimatedDistanceKm: number;
  estimatedDurationHours: string;
  cargoType: string;
  shipmentCategory?:
    | 'container_20'
    | 'container_40'
    | 'bulk'
    | 'machinery'
    | 'containerized'
    | 'bulky_goods'
    | 'special';
  containerNumber?: string;
  shippingLine?: string;
  containerReturn?: ContainerReturnInfo;
  goodsDescription: string;
  totalWeightKg: number;
  dimensions?: string;
  equipmentType?: string;
  bulkCommodity?: string;
  bulkHandlingMethod?: string;
  machineryType?: string;
  lashingStandard?: string;
  requiredDocuments?: string[];

  // Dates & Financials
  createdAt: string;
  scheduledPickupTime: string;
  completedAt?: string;
  rateFDJ: number;
  
  // Timeline events
  timeline: MissionTimelineStep[];
}

export interface MissionKpiData {
  totalMissions: number;
  activeMissions: number;
  completedMissions: number;
  cancelledMissions: number;
  delayedMissions: number;
  pendingAssignments: number;
  todayMissions: number;
}

export interface MonthlyTrendData {
  month: string;
  total: number;
  completed: number;
  delayed: number;
  cancelled: number;
}

export interface MissionFilterState {
  searchKeyword: string;
  datePreset: 'all' | 'today' | 'week' | 'month' | 'custom';
  startDate?: string;
  endDate?: string;
  customerId: string;
  transporterId: string;
  driverId: string;
  vehicleId: string;
  cargoType: string;
  route: string;
  containerNumber: string;
  status: string;
  paymentStatus: string;
  sortBy?: string;
}
