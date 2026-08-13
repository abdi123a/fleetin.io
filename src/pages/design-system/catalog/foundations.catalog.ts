/**
 * Catalogues for the typography, radius, shadow and spacing sections.
 *
 * Each entry names a token and describes where it belongs. Measured values
 * (px sizes, computed shadows) are resolved from the stylesheet at render time
 * and are deliberately absent here.
 */

/* ---------------------------------------------------------------------------
 * Typography
 * ------------------------------------------------------------------------ */

export interface TypeLevel {
  name: string;
  /** Utility class from `styles/typography.css`. */
  utility: string;
  /** Underlying size primitive. */
  token: string;
  usage: string;
  sample?: string;
}

export const TYPE_LEVELS: TypeLevel[] = [
  {
    name: 'Display XL',
    utility: 'type-display-xl',
    token: '--fl-text-4xl',
    usage: 'Landing statements, empty-state headlines',
    sample: 'Fleet operations',
  },
  {
    name: 'Display',
    utility: 'type-display',
    token: '--fl-text-3xl',
    usage: 'Dashboard hero figures',
    sample: 'Fleet operations',
  },
  {
    name: 'Heading 1',
    utility: 'type-h1',
    token: '--fl-text-2xl',
    usage: 'Page title — one per screen',
    sample: 'Shipment overview',
  },
  {
    name: 'Heading 2',
    utility: 'type-h2',
    token: '--fl-text-xl',
    usage: 'Major section heading',
    sample: 'Vehicles required',
  },
  {
    name: 'Heading 3',
    utility: 'type-h3',
    token: '--fl-text-lg',
    usage: 'Card and panel titles',
    sample: 'Verification status',
  },
  {
    name: 'Heading 4',
    utility: 'type-h4',
    token: '--fl-text-md',
    usage: 'Sub-headings inside a panel',
    sample: 'Pricing overview',
  },
  {
    name: 'Body Large',
    utility: 'type-body-lg',
    token: '--fl-text-md',
    usage: "Empty-state titles. No screen writes it by hand — it arrives through EmptyState's default size and the data table's zero-row states",
    sample: 'Consignments are dispatched once every vehicle is confirmed.',
  },
  {
    name: 'Body Medium',
    utility: 'type-body-md',
    token: '--fl-text-md',
    usage: 'Card and panel titles that are not headings',
    sample: 'Consignments are dispatched once every vehicle is confirmed.',
  },
  {
    name: 'Body',
    utility: 'type-body',
    token: '--fl-text-base',
    usage: 'Default copy — the application baseline',
    sample: 'Consignments are dispatched once every vehicle is confirmed.',
  },
  {
    name: 'Body Small',
    utility: 'type-body-sm',
    token: '--fl-text-sm',
    usage: 'Dense tables, secondary descriptions — the workhorse',
    sample: 'Consignments are dispatched once every vehicle is confirmed.',
  },
  {
    name: 'Body Extra Small',
    utility: 'type-body-xs',
    token: '--fl-text-xs',
    usage: 'Console panels and KPI tiles — the most-written level in the product',
    sample: 'Consignments are dispatched once every vehicle is confirmed.',
  },
  {
    name: 'Caption',
    utility: 'type-caption',
    token: '--fl-text-xs',
    usage: 'Metadata, timestamps, helper text. Same metrics as Body XS — prefer one per surface',
    sample: 'Last updated 12 minutes ago',
  },
  {
    name: 'Label',
    utility: 'type-label',
    token: '--fl-text-2xs',
    usage: 'Field labels, table headers, section captions',
    sample: 'Shipment type',
  },
  {
    name: 'Mono',
    utility: 'type-mono',
    token: '--fl-text-xs',
    usage: 'IDs, reference codes, token values',
    sample: 'SHP-1342-DJ',
  },
];

/* ---------------------------------------------------------------------------
 * Radius
 * ------------------------------------------------------------------------ */

export interface RadiusEntry {
  name: string;
  token: string;
  utility: string;
  usage: string;
}

/**
 * Four rungs plus `none`, and the two semantic container aliases.
 *
 * `rounded-card` / `rounded-card-nested` are the pair that matters most in
 * practice: a panel takes `card`, anything drawn inside it steps down to
 * `card-nested`, so an inner corner never looks larger than the corner
 * containing it. Between them they outnumber every raw rung except `md`.
 */
export const RADIUS_TOKENS: RadiusEntry[] = [
  { name: 'None', token: '--fl-radius-none', utility: 'rounded-none', usage: 'Flush edges, full-bleed' },
  { name: 'Small', token: '--fl-radius-sm', utility: 'rounded-sm', usage: 'Chips, inputs, compact controls' },
  { name: 'Medium', token: '--fl-radius-md', utility: 'rounded-md', usage: 'Default control radius — buttons, menu items' },
  { name: 'Large', token: '--fl-radius-lg', utility: 'rounded-lg', usage: 'Cards, panels, dialogs, sheets' },
  { name: 'Card', token: '--radius-card', utility: 'rounded-card', usage: 'Panel and card containers — the outer corner' },
  {
    name: 'Card Nested',
    token: '--radius-card-nested',
    utility: 'rounded-card-nested',
    usage: 'Anything drawn inside a card — steps down from the outer corner',
  },
  { name: 'Full', token: '--fl-radius-full', utility: 'rounded-full', usage: 'Pills, badges, avatars only' },
];

/* ---------------------------------------------------------------------------
 * Shadow / elevation
 * ------------------------------------------------------------------------ */

export interface ShadowEntry {
  name: string;
  token: string;
  utility: string;
  usage: string;
}

export const SHADOW_TOKENS: ShadowEntry[] = [
  {
    name: 'Card',
    token: '--elevation-card',
    utility: 'shadow-card',
    usage: 'The console panel surface — every dashboard kit exports it as PANEL_SURFACE',
  },
  { name: 'Extra Small', token: '--elevation-xs', utility: 'shadow-xs', usage: 'Resting cards, subtle lift' },
  { name: 'Small', token: '--elevation-sm', utility: 'shadow-sm', usage: 'Raised panels, sticky bars' },
  { name: 'Medium', token: '--elevation-md', utility: 'shadow-md', usage: 'Dropdowns, tooltips' },
  { name: 'Large', token: '--elevation-lg', utility: 'shadow-lg', usage: 'Popovers, drawers' },
  { name: 'Extra Large', token: '--elevation-xl', utility: 'shadow-xl', usage: 'Modal dialogs' },
];

/* ---------------------------------------------------------------------------
 * Spacing
 * ------------------------------------------------------------------------ */

export interface SpacingEntry {
  /** Pixel value as displayed, e.g. "16". */
  name: string;
  token: string;
  /** Tailwind step suffix — `4` gives `p-4`, `gap-4`, `m-4`. */
  step: string;
  /** Pixel value, used to size the proportional bar. */
  px: number;
  usage: string;
}

export const SPACING_TOKENS: SpacingEntry[] = [
  { name: '0', token: '--fl-space-0', step: '0', px: 0, usage: 'Collapse a gap without removing the utility' },
  { name: '2', token: '--fl-space-0-5', step: '0.5', px: 2, usage: 'Hairline gap inside a chip or badge' },
  { name: '4', token: '--fl-space-1', step: '1', px: 4, usage: 'Icon-to-label gap, hairline insets' },
  { name: '6', token: '--fl-space-1-5', step: '1.5', px: 6, usage: 'Icon-to-label gap in dense console rows' },
  { name: '8', token: '--fl-space-2', step: '2', px: 8, usage: 'Tight control padding, chip gaps' },
  { name: '10', token: '--fl-space-2-5', step: '2.5', px: 10, usage: 'Console panel inner padding' },
  { name: '12', token: '--fl-space-3', step: '3', px: 12, usage: 'Compact card padding, list gaps' },
  { name: '16', token: '--fl-space-4', step: '4', px: 16, usage: 'Default padding and gap' },
  { name: '20', token: '--fl-space-5', step: '5', px: 20, usage: 'Comfortable panel padding' },
  { name: '24', token: '--fl-space-6', step: '6', px: 24, usage: 'Card padding, section gaps' },
  { name: '32', token: '--fl-space-8', step: '8', px: 32, usage: 'Between related sections' },
  { name: '40', token: '--fl-space-10', step: '10', px: 40, usage: 'Between major blocks' },
  { name: '48', token: '--fl-space-12', step: '12', px: 48, usage: 'Section separation' },
  { name: '64', token: '--fl-space-16', step: '16', px: 64, usage: 'Page-level section rhythm' },
  { name: '80', token: '--fl-space-20', step: '20', px: 80, usage: 'Large empty-state padding, and the 4xl logo height' },
  { name: '96', token: '--fl-space-24', step: '24', px: 96, usage: 'Oversized empty-state padding and identity avatars' },
];

/** Largest step, used to scale every bar proportionally. */
export const SPACING_MAX_PX = Math.max(...SPACING_TOKENS.map((entry) => entry.px));
