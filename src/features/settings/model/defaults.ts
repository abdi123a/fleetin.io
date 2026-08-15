import { COMPANY } from '@/config/company';
import { ID_DIGITS, ID_PREFIX } from '@/lib/ids';

import type { NotificationChannel, SystemSettings } from './types';

/**
 * What the app was doing before it had settings.
 *
 * Every value below is lifted from the constant it replaces — `config/company.ts`,
 * `lib/bi/config.ts`, `features/transporter-bi/config.ts`, `lib/ids.ts` — so a
 * fresh install behaves exactly as the hard-coded build did and "Reset section"
 * genuinely returns to known behaviour. When a default here disagrees with the
 * constant it came from, the constant is the bug.
 */
export const DEFAULT_SETTINGS: SystemSettings = {
  organization: {
    tradingName: COMPANY.tradingName,
    legalName: COMPANY.legalName,
    tagline: COMPANY.tagline,
    hrDepartment: 'Département des Ressources Humaines',

    addressLine1: COMPANY.address.line1,
    addressLine2: COMPANY.address.line2,
    city: COMPANY.address.city,
    country: COMPANY.address.country,

    phone: COMPANY.contact.phone,
    mobile: COMPANY.contact.mobile,
    email: COMPANY.contact.email,
    website: COMPANY.contact.website,

    tradeRegister: COMPANY.registration.tradeRegister,
    taxId: COMPANY.registration.taxId,
    cnssId: '',
  },

  branding: {
    logoSrc: null,
    logoWhiteSrc: null,
    markSrc: null,
    faviconSrc: null,
    loginBackgroundSrc: null,
    // Brand teal. The app's own `--primary` is not configurable — this colour
    // only ever reaches printed paper.
    documentAccent: '#60969D',
    defaultTheme: 'system',
    sidebarCollapsedByDefault: false,
  },

  documents: {
    logoHeightMm: 16,
    showFooterMark: true,

    invoiceTerms:
      'Payment is due within the terms stated above. Settlement by bank transfer to the account shown; ' +
      'please quote the invoice reference on the transfer.',
    invoiceDisclaimer:
      'This invoice is issued electronically and is valid without a handwritten signature unless stamped above.',
    voucherTerms:
      'This voucher records one settlement against the shipment named above. The signature below acknowledges ' +
      'receipt in full for the work described.',

    signatories: {
      prepared: { name: '', role: 'Prepared by', signatureSrc: null },
      checked: { name: '', role: 'Checked by', signatureSrc: null },
      approved: { name: '', role: 'Approved by', signatureSrc: null },
    },
    signatureBlocks: {
      invoice: ['approved'],
      voucher: ['prepared', 'approved'],
    },

    stamp: {
      src: null,
      opacityPct: 85,
      sizeMm: 32,
      placement: 'signature',
      onInvoice: true,
      onVoucher: true,
    },

    defaultRemittanceAccountId: '',
  },

  commission: {
    // Mirrors the server. `/settings` is the authority — see `useSystemSettings`.
    fleetinCommissionPct: 0,
    roundingUnitDjf: 1,
    minimumInvoiceDjf: 0,
    billingCycle: 'monthly',
    invoiceIssueDay: 0,
  },

  finance: {
    baseCurrency: 'DJF',
    // Banque Centrale de Djibouti peg.
    usdToDjf: 177.721,
    showSecondaryCurrency: false,

    paymentTermsDays: 30,
    overdueGraceDays: 0,
    settlementWeekday: 4,

    payoutAdvisoryHours: 48,
    requiredPodAttachments: 2,
    blockReleaseOnOpenHold: true,

    detentionRatePerDay: 50,
    detentionCurrency: 'USD',
    defaultFreeTimeDays: 7,
  },

  operations: {
    onTimeGraceMinutes: 12 * 60,
    earlyThresholdMinutes: 24 * 60,
    onTimeTarget: 0.92,
    utilizationTarget: 0.8,
    backhaulMatchTarget: 0.75,

    returnDueSoonHours: 48,
    emptyRiskHours: 24,

    riskWeights: { etaDrift: 0.45, stageDwell: 0.35, freeTime: 0.2 },
    riskCritical: 70,
    riskWarning: 40,

    co2PerKmLoaded: 0.92,
    co2PerKmEmpty: 0.68,
    emptyCostPerKm: 0.95,
  },

  numbering: {
    digits: ID_DIGITS,
    prefixes: { ...ID_PREFIX },
    hrReferencePattern: 'Fl/{prefix}-{seq}/{yy}',
    resetYearly: false,
  },

  integrations: {
    ai: {
      enabled: false,
      provider: 'anthropic',
      apiKey: '',
      model: 'claude-sonnet-5',
      baseUrl: '',
      features: {
        documentExtraction: false,
        routeSuggestions: false,
        chatAssistant: false,
        anomalyDetection: false,
      },
      maxTokens: 4096,
    },

    email: {
      enabled: false,
      fromName: COMPANY.tradingName,
      fromAddress: COMPANY.contact.email,
      replyTo: '',
      smtpHost: '',
      smtpPort: 587,
      smtpUser: '',
      smtpPassword: '',
      useTls: true,
    },

    sms: {
      enabled: false,
      provider: 'twilio',
      senderId: 'FLEETIN',
      apiKey: '',
      baseUrl: '',
    },

    tracking: {
      enabled: false,
      provider: '',
      apiKey: '',
      pollIntervalSeconds: 60,
    },

    storage: {
      provider: 'backend',
      bucket: '',
      region: '',
      maxUploadMb: 10,
    },

    webhookUrl: '',
    webhookSecret: '',
    apiBaseUrl: '',
  },

  notifications: {
    rules: {},
    quietHours: { enabled: false, from: '21:00', to: '06:00' },
    digest: 'off',
  },

  access: {
    sessionTimeoutMinutes: 60,
    passwordMinLength: 10,
    passwordRequireComplexity: true,
    passwordExpiryDays: 0,
    requireTwoFactor: false,

    allowedEmailDomains: [],
    autoApproveAccessRequests: false,
    auditRetentionDays: 365,
    ipAllowlist: [],
  },

  localization: {
    language: 'en',
    timezone: 'Africa/Djibouti',
    dateFormat: 'dd MMM yyyy',
    timeFormat: '24h',
    weekStartsOn: 1,
    fiscalYearStartMonth: 1,
    numberFormat: 'en-GB',
  },
};

/**
 * Every event the app can tell somebody about.
 *
 * Grouped by the module that raises it so the notification matrix reads as the
 * app does. Adding an event here adds a row to the matrix and nothing else —
 * the default channel set is applied on first read.
 */
export const NOTIFICATION_EVENTS: ReadonlyArray<{
  id: string;
  group: string;
  label: string;
  description: string;
  defaultChannels: NotificationChannel[];
}> = [
  {
    id: 'shipment.created',
    group: 'Operations',
    label: 'Shipment created',
    description: 'A new consignment is opened.',
    defaultChannels: ['inApp'],
  },
  {
    id: 'shipment.delayed',
    group: 'Operations',
    label: 'Shipment running late',
    description: 'ETA drifts past the on-time grace window.',
    defaultChannels: ['inApp', 'email'],
  },
  {
    id: 'shipment.delivered',
    group: 'Operations',
    label: 'Delivery confirmed',
    description: 'Proof of delivery is attached and the leg closes.',
    defaultChannels: ['inApp'],
  },
  {
    id: 'emptyReturn.dueSoon',
    group: 'Empty Return',
    label: 'Container due back soon',
    description: 'Free time runs out inside the due-soon window.',
    defaultChannels: ['inApp', 'email'],
  },
  {
    id: 'emptyReturn.overdue',
    group: 'Empty Return',
    label: 'Container past free time',
    description: 'Detention is accruing now.',
    defaultChannels: ['inApp', 'email', 'sms'],
  },
  {
    id: 'emptyReturn.matchFound',
    group: 'Empty Return',
    label: 'Backhaul match available',
    description: 'An outbound trip can be paired with a return load.',
    defaultChannels: ['inApp'],
  },
  {
    id: 'finance.invoiceIssued',
    group: 'Finance',
    label: 'Invoice issued',
    description: 'A client invoice is raised.',
    defaultChannels: ['inApp', 'email'],
  },
  {
    id: 'finance.invoiceOverdue',
    group: 'Finance',
    label: 'Invoice overdue',
    description: 'Payment terms have lapsed without settlement.',
    defaultChannels: ['inApp', 'email'],
  },
  {
    id: 'finance.paymentReleased',
    group: 'Finance',
    label: 'Transporter payment released',
    description: 'A settlement is approved for payout.',
    defaultChannels: ['inApp'],
  },
  {
    id: 'finance.holdOpened',
    group: 'Finance',
    label: 'Hold opened',
    description: 'Money is stopped on a shipment.',
    defaultChannels: ['inApp', 'email'],
  },
  {
    id: 'compliance.documentExpiring',
    group: 'Compliance',
    label: 'Document expiring',
    description: 'A vehicle, driver or partner document is inside 30 days of expiry.',
    defaultChannels: ['inApp', 'email'],
  },
  {
    id: 'access.requestSubmitted',
    group: 'Administration',
    label: 'Access request submitted',
    description: 'Somebody asks for an account.',
    defaultChannels: ['inApp', 'email'],
  },
  {
    id: 'hr.leaveRequested',
    group: 'HR',
    label: 'Leave requested',
    description: 'An employee files a leave request.',
    defaultChannels: ['inApp'],
  },
  {
    id: 'hr.payrollReady',
    group: 'HR',
    label: 'Payroll period ready',
    description: 'A payroll run is calculated and awaiting approval.',
    defaultChannels: ['inApp', 'email'],
  },
];
