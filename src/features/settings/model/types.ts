/**
 * Everything in FLEETIN that is a *decision* rather than a fact.
 *
 * The rule this file exists to enforce: if an operator could ever reasonably
 * answer "that should say something else" or "that number is wrong for us",
 * the value belongs here and not in a `const` halfway down a component. Before
 * this module the letterhead lived in `config/company.ts`, the commission in a
 * one-field API, the payout policy in `lib/bi/config.ts`, the peg in
 * `features/transporter-bi/config.ts`, and the signature block did not exist
 * at all — five places, none of them reachable without a code change.
 *
 * Structure is by *who owns the answer*, not by which screen reads it:
 *
 * - `organization` / `branding` / `documents` — the finance director and
 *   whoever signs. These print. A wrong value here reaches a client.
 * - `commission` / `finance` — the money rules. Changing them re-prices
 *   future work; nothing already booked is ever restated.
 * - `operations` — the thresholds every badge, gauge and risk score colours
 *   against. Policy questions ("what counts as on time?"), one answer each.
 * - `numbering` — reference formats. Changing a prefix does not renumber
 *   history; it only affects the next reference minted.
 * - `integrations` / `notifications` / `access` / `localization` — the
 *   plumbing.
 *
 * Secrets caveat, stated once and repeated in the UI: this store lives in the
 * browser. Anything typed into an API-key field is readable by anyone with the
 * machine and by any script on the page. Keys are kept here so the app can be
 * configured end-to-end today, but a production deployment must move them
 * behind the backend. See `IntegrationSettings`.
 */

// ─── Organization ───────────────────────────────────────────────────────────

/** The legal entity. This is the letterhead, and it prints. */
export interface OrganizationSettings {
  /** What the app calls itself in chrome and page titles. */
  tradingName: string;
  /** Registered name and form, as on the trade register. */
  legalName: string;
  /** One line under the name on a document. */
  tagline: string;
  /** HR documents print a department line above the signature. */
  hrDepartment: string;

  addressLine1: string;
  addressLine2: string;
  city: string;
  country: string;

  phone: string;
  mobile: string;
  email: string;
  website: string;

  /** Trade register / RC number. */
  tradeRegister: string;
  /** NIF, as issued. */
  taxId: string;
  /** Social security employer number — payroll documents print it. */
  cnssId: string;
}

// ─── Branding ───────────────────────────────────────────────────────────────

/**
 * Images are stored as data URLs so a logo survives a reload with no upload
 * endpoint behind it. `null` means "use the file shipped in `/public`", which
 * is the state a fresh install is in.
 */
export interface BrandingSettings {
  /** Full wordmark, colour. Sidebar, login, document letterhead. */
  logoSrc: string | null;
  /** Wordmark flattened for a dark panel. Falls back to the colour one. */
  logoWhiteSrc: string | null;
  /** Square glyph. Collapsed rail, document footer, favicon fallback. */
  markSrc: string | null;
  /** Browser tab icon. Falls back to the mark. */
  faviconSrc: string | null;
  /** Optional artwork behind the login form. */
  loginBackgroundSrc: string | null;

  /**
   * Accent used on *printed* documents only — rules, table heads, the amount
   * block. Deliberately separate from the app's `--primary`, which is fixed
   * brand teal and is not a per-install choice.
   */
  documentAccent: string;

  /** Default theme for a user who has never chosen one. */
  defaultTheme: 'light' | 'dark' | 'system';
  /** Sidebar starts collapsed on first load. */
  sidebarCollapsedByDefault: boolean;
}

// ─── Documents ──────────────────────────────────────────────────────────────

/** One person who signs. Name and role print; the image is optional. */
export interface Signatory {
  name: string;
  role: string;
  /** Scanned signature, data URL. Printed above the rule when present. */
  signatureSrc: string | null;
}

export interface DocumentSettings {
  /** Letterhead height in millimetres — documents are laid out in mm. */
  logoHeightMm: number;
  /** Print the mark + legal name in the document footer. */
  showFooterMark: boolean;

  /** Terms block on a client invoice. Free text, printed verbatim. */
  invoiceTerms: string;
  /** Small print under the signature block on an invoice. */
  invoiceDisclaimer: string;
  /** Terms block on a transporter payment voucher. */
  voucherTerms: string;

  /** Who signs, in print order. Empty array prints no signature block. */
  signatories: {
    prepared: Signatory;
    checked: Signatory;
    approved: Signatory;
  };
  /** Which of the three actually print. */
  signatureBlocks: {
    invoice: Array<'prepared' | 'checked' | 'approved'>;
    voucher: Array<'prepared' | 'checked' | 'approved'>;
  };

  /** Company stamp / seal. */
  stamp: {
    src: string | null;
    /** 0–100. A stamp printed at full strength hides the figures under it. */
    opacityPct: number;
    /** Millimetres. */
    sizeMm: number;
    placement: 'signature' | 'footer' | 'watermark';
    onInvoice: boolean;
    onVoucher: boolean;
  };

  /** Bank account id money is requested to. Empty = ask per invoice. */
  defaultRemittanceAccountId: string;
}

// ─── Commission & billing ───────────────────────────────────────────────────

/**
 * The one figure that decides what every transporter is paid.
 *
 * Direction is easy to get backwards: a transporter's price list is what the
 * SHIPPER is billed, Fleetin's cut already inside it. The transporter is paid
 * that total MINUS this percentage.
 *
 * `fleetinCommissionPct` is the only field here that is **server-owned** — it
 * lives in `app_settings` and is written through `/settings`. It is mirrored
 * into this store so offline screens have a value, never read in preference
 * to the server's.
 */
export interface CommissionSettings {
  fleetinCommissionPct: number;
  /** Money is rounded to this many DJF on a document. 1 = whole francs. */
  roundingUnitDjf: number;
  /** Below this, an invoice is not raised and the amount rolls forward. */
  minimumInvoiceDjf: number;
  /** Shippers are billed once per period, not per shipment. */
  billingCycle: 'monthly' | 'biweekly' | 'weekly';
  /** Day of month the monthly invoice is cut. 0 = last day of month. */
  invoiceIssueDay: number;
}

// ─── Finance policy ─────────────────────────────────────────────────────────

export interface FinancePolicySettings {
  /** The ledger's currency. Everything is booked in it. */
  baseCurrency: string;
  /** Fixed peg, DJF per USD — the franc is pegged, this is not a market rate. */
  usdToDjf: number;
  /** Show a USD figure beside DJF on money screens. */
  showSecondaryCurrency: boolean;

  /** Invoice falls due this many days after issue. */
  paymentTermsDays: number;
  /** Past due by this many days, an invoice reads as overdue rather than open. */
  overdueGraceDays: number;
  /** Settlement runs on this UTC weekday. 0 = Sunday, 4 = Thursday. */
  settlementWeekday: number;

  /**
   * The payout window **advises**, it does not block — settled 2026-08-13.
   * Only the two rules below can actually stop money.
   */
  payoutAdvisoryHours: number;
  /** A release needs this many proof-of-delivery attachments. */
  requiredPodAttachments: number;
  /** An open hold stops a release. */
  blockReleaseOnOpenHold: boolean;

  /** Detention billed per container per day past free time. */
  detentionRatePerDay: number;
  /** Currency detention is quoted in — the lines bill in USD. */
  detentionCurrency: string;
  /** Free time when the shipping line has not specified one. */
  defaultFreeTimeDays: number;
}

// ─── Operations thresholds ──────────────────────────────────────────────────

export interface OperationsSettings {
  /** How late a delivery may be and still count as on time. */
  onTimeGraceMinutes: number;
  /** Beyond this, an early arrival is reported separately. */
  earlyThresholdMinutes: number;
  /** Contractual on-time rate the gauges mark. 0–1. */
  onTimeTarget: number;
  /** Fleet utilisation planned around. 0–1. */
  utilizationTarget: number;
  /** Share of outbound trips backhaul matching aims to cover. 0–1. */
  backhaulMatchTarget: number;

  /** Container inside this many hours of free time is "due soon". */
  returnDueSoonHours: number;
  /** A live trip arriving inside this window with no return load is an alert. */
  emptyRiskHours: number;

  /** Risk score weights. Must sum to 1. */
  riskWeights: {
    etaDrift: number;
    stageDwell: number;
    freeTime: number;
  };
  /** Score at or above which an alert is critical / a warning. */
  riskCritical: number;
  riskWarning: number;

  /** kg CO₂ per vehicle-km. */
  co2PerKmLoaded: number;
  co2PerKmEmpty: number;
  /** Direct running cost of an empty km, USD. */
  emptyCostPerKm: number;
}

// ─── Numbering ──────────────────────────────────────────────────────────────

/**
 * Reference formats. Changing a prefix affects the NEXT reference minted and
 * nothing already issued — history is never renumbered.
 */
export interface NumberingSettings {
  /** Digits after the hyphen. The scheme is three letters + this many. */
  digits: number;
  /** Prefix per record kind. Keys match `IdKind` in `lib/ids.ts`. */
  prefixes: Record<string, string>;
  /** HR document pattern. Tokens: {prefix} {seq} {yy} {yyyy}. */
  hrReferencePattern: string;
  /** Sequences restart each year. */
  resetYearly: boolean;
}

// ─── Integrations ───────────────────────────────────────────────────────────

/**
 * ⚠ Every `*Key` field below is stored in the browser. Treat it as public to
 * anyone with access to the machine. The fields exist so the app can be driven
 * end-to-end without a deploy; the moment this is real, the key moves to the
 * backend and this field holds nothing.
 */
export interface IntegrationSettings {
  ai: {
    enabled: boolean;
    provider: 'anthropic' | 'openai' | 'none';
    apiKey: string;
    /** Model id, e.g. `claude-sonnet-5`. */
    model: string;
    /** Optional self-hosted / proxy endpoint. */
    baseUrl: string;
    /** What the assistant is allowed to do. */
    features: {
      documentExtraction: boolean;
      routeSuggestions: boolean;
      chatAssistant: boolean;
      anomalyDetection: boolean;
    };
    /** Ceiling per call, so a bad prompt cannot run up a bill. */
    maxTokens: number;
  };

  email: {
    enabled: boolean;
    fromName: string;
    fromAddress: string;
    replyTo: string;
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPassword: string;
    useTls: boolean;
  };

  sms: {
    enabled: boolean;
    provider: 'twilio' | 'africastalking' | 'custom';
    senderId: string;
    apiKey: string;
    /** Custom gateway endpoint when `provider` is `custom`. */
    baseUrl: string;
  };

  tracking: {
    enabled: boolean;
    /** GPS / telematics provider feeding vehicle positions. */
    provider: string;
    apiKey: string;
    /** Seconds between position polls. */
    pollIntervalSeconds: number;
  };

  storage: {
    /** Where uploaded documents land. */
    provider: 'backend' | 's3';
    bucket: string;
    region: string;
    /** Reject an upload above this. */
    maxUploadMb: number;
  };

  /** Outbound webhook, fired on the events selected in notifications. */
  webhookUrl: string;
  webhookSecret: string;

  /** Backend the app talks to. Blank falls back to the build-time value. */
  apiBaseUrl: string;
}

// ─── Notifications ──────────────────────────────────────────────────────────

export type NotificationChannel = 'inApp' | 'email' | 'sms' | 'webhook';

/** One event, and which channels it goes out on. */
export interface NotificationRule {
  channels: NotificationChannel[];
  enabled: boolean;
}

export interface NotificationSettings {
  /** Keyed by event id — see `NOTIFICATION_EVENTS` in `defaults.ts`. */
  rules: Record<string, NotificationRule>;
  /** No SMS or email outside these hours, local time. */
  quietHours: { enabled: boolean; from: string; to: string };
  /** Roll repeats of the same event into one message. */
  digest: 'off' | 'hourly' | 'daily';
}

// ─── Access & security ──────────────────────────────────────────────────────

export interface AccessSettings {
  /** Log a session out after this long idle. 0 = never. */
  sessionTimeoutMinutes: number;
  passwordMinLength: number;
  /** Require a mix of case, digit and symbol. */
  passwordRequireComplexity: boolean;
  /** Force a reset after this many days. 0 = never. */
  passwordExpiryDays: number;
  requireTwoFactor: boolean;

  /** Self-registration is only allowed from these email domains. */
  allowedEmailDomains: string[];
  /** A matching-domain request is approved without a human. */
  autoApproveAccessRequests: boolean;
  /** Keep the audit log this long. */
  auditRetentionDays: number;
  /** Refuse to sign in from outside these CIDRs. Empty = no restriction. */
  ipAllowlist: string[];
}

// ─── Localization ───────────────────────────────────────────────────────────

export interface LocalizationSettings {
  language: 'en' | 'fr';
  timezone: string;
  dateFormat: 'dd/MM/yyyy' | 'yyyy-MM-dd' | 'dd MMM yyyy' | 'MM/dd/yyyy';
  timeFormat: '24h' | '12h';
  /** 1 = Monday. */
  weekStartsOn: 0 | 1 | 6;
  /** Month the financial year opens. 1 = January. */
  fiscalYearStartMonth: number;
  numberFormat: 'fr-DJ' | 'en-GB' | 'en-US';
}

// ─── The whole thing ────────────────────────────────────────────────────────

export interface SystemSettings {
  organization: OrganizationSettings;
  branding: BrandingSettings;
  documents: DocumentSettings;
  commission: CommissionSettings;
  finance: FinancePolicySettings;
  operations: OperationsSettings;
  numbering: NumberingSettings;
  integrations: IntegrationSettings;
  notifications: NotificationSettings;
  access: AccessSettings;
  localization: LocalizationSettings;
}

export type SettingsSection = keyof SystemSettings;
