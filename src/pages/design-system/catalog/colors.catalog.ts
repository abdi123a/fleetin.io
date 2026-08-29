import type { ColorSwatchPreview } from '@/design-system/showcase';

/**
 * Colour catalogue for the showcase.
 *
 * Organised the standard way: Neutrals, Primary Brand, Semantic Feedback,
 * Interactive Tints. Every entry is real and used — nothing here is shown
 * because a category "should" have an example. Interactive Tints in
 * particular is short on purpose: Primary is the only role with a hover and
 * an active state anyone actually reaches for. Accent, Secondary and every
 * semantic colour define the same hover/active tokens, but zero call sites
 * use them — showing them would document a state the product doesn't have.
 * Disabled isn't a colour at all here; every control dims via opacity-50
 * rather than swapping to a token, so there's nothing to swatch. It carries
 * no colour values — those are read from the live stylesheet at render time,
 * so this file cannot fall out of step with `tokens.semantic.css`.
 */

export interface ColorEntry {
  name: string;
  token: string;
  utility: string;
  preview?: ColorSwatchPreview;
  usage?: string;
  pairedForeground?: string;
}

export interface ColorGroup {
  id: string;
  title: string;
  description: string;
  colors: ColorEntry[];
}

export const COLOR_GROUPS: ColorGroup[] = [
  {
    id: 'neutrals',
    title: 'Neutrals',
    description:
      'White through near-black, twelve steps in the primitive ramp — this is eight of them. Every neutral role in the system (page canvas, panel surfaces, borders, body text) is one of these steps aliased to a name; the alias is what you write in code, but the ramp is what you\'re actually looking at.',
    colors: [
      {
        name: 'Neutral 0',
        token: '--fl-neutral-0',
        utility: 'bg-background',
        preview: 'surface',
        usage: 'White. The page canvas, panel surfaces and cards',
      },
      {
        name: 'Neutral 100',
        token: '--fl-neutral-100',
        utility: 'bg-muted',
        preview: 'surface',
        usage: 'Hover fills, de-emphasised blocks',
      },
      {
        name: 'Neutral 200',
        token: '--fl-neutral-200',
        utility: 'border-border',
        preview: 'border',
        usage: 'The default line between surfaces',
      },
      {
        name: 'Neutral 400',
        token: '--fl-neutral-400',
        utility: 'text-muted-foreground',
        preview: 'text',
        usage: 'Chart axes and grid lines; secondary text in dark mode',
      },
      {
        name: 'Neutral 600',
        token: '--fl-neutral-600',
        utility: 'text-muted-foreground',
        preview: 'text',
        usage: 'Secondary text, captions, labels',
      },
      {
        name: 'Neutral 800',
        token: '--fl-neutral-800',
        utility: 'text-secondary-foreground',
        preview: 'text',
        usage: 'Text on the Secondary grey fill',
      },
      {
        name: 'Neutral 900',
        token: '--fl-neutral-900',
        utility: 'text-foreground',
        preview: 'text',
        usage: 'Body copy, headings — the near-black endpoint',
      },
      {
        name: 'Neutral 950',
        token: '--fl-neutral-950',
        utility: 'text-accent-foreground',
        preview: 'text',
        usage: 'Text on a filled accent tile, and the pastel KPI tile text',
      },
    ],
  },
  {
    id: 'primary-brand',
    title: 'Primary Brand',
    description:
      "One colour: #60969D, the teal every primary button, active nav state and focus ring is built from. Subtle tints a background or the active nav pill; Bold is the filled step for when the colour has to hold text, since the base value only clears 3.3:1 — an accepted trade for a large fill, not for a caption. This is the colour to reach for; everything else on this page is either a supporting colour or a state of this one.",
    colors: [
      {
        name: 'Primary',
        token: '--primary',
        utility: 'bg-primary',
        usage: 'Primary actions, active navigation, the sidebar fill',
        pairedForeground: '--primary-foreground',
      },
      {
        name: 'Primary Subtle',
        token: '--primary-subtle',
        utility: 'bg-primary-subtle',
        usage: 'Tinted backgrounds, the active nav pill',
        pairedForeground: '--primary-subtle-foreground',
      },
      {
        name: 'Primary Bold',
        token: '--primary-bold',
        utility: 'bg-primary-bold',
        usage: 'A filled surface that carries text, e.g. a teal IconChip disc',
        pairedForeground: '--primary-bold-foreground',
      },
      {
        name: 'Focus Ring',
        token: '--ring',
        utility: 'outline-ring',
        preview: 'border',
        usage: 'Same teal, one step out — the focus indicator. Never remove it',
      },
    ],
  },
  {
    id: 'secondary-brand',
    title: 'Accent & Secondary',
    description:
      'Two supporting colours, each used far more sparingly than Primary. Accent is orange — the second half of the "teal reports, orange asks" system, for emphasis that must not read as the main action. Secondary is a plain neutral grey, for a control that shouldn\'t read as branded at all.',
    colors: [
      {
        name: 'Accent',
        token: '--accent',
        utility: 'bg-accent',
        usage: 'Emphasis that must not read as an action',
        pairedForeground: '--accent-foreground',
      },
      {
        name: 'Accent Bold',
        token: '--accent-bold',
        utility: 'bg-accent-bold',
        usage: 'A filled surface that carries text — the orange IconChip disc',
        pairedForeground: '--accent-bold-foreground',
      },
      {
        name: 'Secondary',
        token: '--secondary',
        utility: 'bg-secondary',
        usage: 'Neutral action fills that should not read as branded',
        pairedForeground: '--secondary-foreground',
      },
    ],
  },
  {
    id: 'semantic-feedback',
    title: 'Semantic Feedback',
    description:
      'Red, green, amber and blue — four intents, each with a solid form for chips and badges and a subtle form for banners and row backgrounds. A feature decides which business state maps to which intent; the intent itself never encodes domain meaning.',
    colors: [
      {
        name: 'Success',
        token: '--success',
        utility: 'bg-success',
        usage: 'Verified, delivered, completed',
        pairedForeground: '--success-foreground',
      },
      {
        name: 'Success Subtle',
        token: '--success-subtle',
        utility: 'bg-success-subtle',
        usage: 'Success banners and row backgrounds',
        pairedForeground: '--success-subtle-foreground',
      },
      {
        name: 'Warning',
        token: '--warning',
        utility: 'bg-warning',
        usage: 'Pending, expiring, needs attention',
        pairedForeground: '--warning-foreground',
      },
      {
        name: 'Warning Subtle',
        token: '--warning-subtle',
        utility: 'bg-warning-subtle',
        usage: 'Warning banners and row backgrounds',
        pairedForeground: '--warning-subtle-foreground',
      },
      {
        name: 'Danger',
        token: '--destructive',
        utility: 'bg-destructive',
        usage: 'Destructive actions, failures, rejections',
        pairedForeground: '--destructive-foreground',
      },
      {
        name: 'Danger Subtle',
        token: '--destructive-subtle',
        utility: 'bg-destructive-subtle',
        usage: 'Error banners and row backgrounds',
        pairedForeground: '--destructive-subtle-foreground',
      },
      {
        name: 'Info',
        token: '--info',
        utility: 'bg-info',
        usage: 'Informational, tracking, neutral notices',
        pairedForeground: '--info-foreground',
      },
      {
        name: 'Info Subtle',
        token: '--info-subtle',
        utility: 'bg-info-subtle',
        usage: 'Info banners and row backgrounds',
        pairedForeground: '--info-subtle-foreground',
      },
    ],
  },
  {
    id: 'container-state',
    title: 'Container State',
    description:
      'The one colour axis the whole app reads a container by: teal while the box is still full, brand yellow once it has been stripped. It flips on the "Empty Ready" rung — the moment Operations records the box as emptied, which is also the moment the empty return opens and detention starts running. Not progress and not urgency: the status ladder still says how far along a job is, and the urgency scale still says how close a return is to its deadline. Aliases of the two brand hues, so if a brand role moves the container marks move with it. Colour never carries it alone — `ContainerStateTag` is solid with a closed box when full, dashed with an open box when empty.',
    colors: [
      {
        name: 'Container Full',
        token: '--container-full',
        utility: 'bg-container-full',
        usage: 'The FULL slab — a box still carrying cargo',
        pairedForeground: '--container-full-foreground',
      },
      {
        name: 'Container Full Subtle',
        token: '--container-full-subtle',
        utility: 'bg-container-full-subtle',
        usage: 'The low-emphasis form, for a row that already carries a saturated mark',
        pairedForeground: '--container-full-subtle-foreground',
      },
      {
        name: 'Container Empty',
        token: '--container-empty',
        utility: 'bg-container-empty',
        usage: 'The EMPTY slab — a stripped box that owes a return',
        pairedForeground: '--container-empty-foreground',
      },
      {
        name: 'Container Empty Subtle',
        token: '--container-empty-subtle',
        utility: 'bg-container-empty-subtle',
        usage: 'The low-emphasis form of the same mark',
        pairedForeground: '--container-empty-subtle-foreground',
      },
      {
        name: 'Container Returned',
        token: '--container-returned',
        utility: 'bg-container-returned',
        usage: 'The RETURNED slab — the box is home and the job is closed. Ink, inverted in dark mode',
        pairedForeground: '--container-returned-foreground',
      },
      {
        name: 'Container Returned Subtle',
        token: '--container-returned-subtle',
        utility: 'bg-container-returned-subtle',
        usage: 'The low-emphasis form — counts and captions on a finished record',
        pairedForeground: '--container-returned-subtle-foreground',
      },
      {
        name: 'Tile Done',
        token: '--tile-done',
        utility: 'bg-tile-done',
        usage: 'The record masthead once every container on it is home — the teal slab gone to ink',
        pairedForeground: '--tile-done-foreground',
      },
    ],
  },
  {
    id: 'interactive-tints',
    title: 'Interactive Tints',
    description:
      'Hover and press states — one step darker off the base colour. Primary is the only role shown here because it is the only one with a real call site: Accent, Secondary and all four Semantic colours define the same hover/active tokens, but nothing in the product uses them, so showing them would document a state that doesn\'t exist. Disabled isn\'t a colour at all — every control dims to 50% opacity rather than swapping to a token, whatever colour it already is.',
    colors: [
      {
        name: 'Primary Hover',
        token: '--primary-hover',
        utility: 'hover:bg-primary-hover',
        usage: 'Pointer hover state',
        pairedForeground: '--primary-foreground',
      },
      {
        name: 'Primary Active',
        token: '--primary-active',
        utility: 'bg-primary-active',
        usage: 'Pressed state',
        pairedForeground: '--primary-foreground',
      },
    ],
  },
];

/**
 * Specialised roles that exist and are real, but are scoped to one surface
 * each rather than being general-purpose palette — so they're named here in
 * one line instead of getting their own swatch grid, and documented properly
 * next to the thing that actually uses them.
 */
export const SPECIALISED_COLOR_NOTE =
  'A handful of further roles are scoped to one surface each rather than being general palette: the four KPI tile fills and chart series colours are covered in Dashboard & Console, and the sidebar’s own token family (nav item states, the sliding marker) is covered in Application Shell. The Empty Returns urgency scale (overdue/critical/at-risk/watch/safe/protected) is mixed from the four Semantic Feedback intents above rather than a fifth palette. Card, Surface and Border also have Strong/Sunken/Raised steps for the rare panel that needs more or less separation than the default.';
