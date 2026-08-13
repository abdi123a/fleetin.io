import type { Guideline, PropDefinition } from '@/design-system/showcase';
import type { ButtonSize, ButtonVariant } from '@/design-system';

/**
 * Catalogue backing the Buttons documentation.
 *
 * The variant and size lists are typed against the component's own union types,
 * so adding a variant to `buttonVariants` without documenting it — or
 * documenting one that no longer exists — is a compile error rather than a
 * silently stale page.
 */

export interface VariantEntry {
  variant: ButtonVariant;
  label: string;
  usage: string;
}

export const BUTTON_VARIANTS: VariantEntry[] = [
  {
    variant: 'outline',
    label: 'Outline',
    usage: 'The workhorse — nearly half of every button in the product. Neutral actions on a busy surface.',
  },
  {
    variant: 'primary',
    label: 'Primary',
    usage: 'The single most important action on a screen. One per view.',
  },
  {
    variant: 'secondary',
    label: 'Secondary',
    usage: 'Supporting actions beside a primary. Neutral grey, unlike subtle.',
  },
  {
    variant: 'ghost',
    label: 'Ghost',
    usage: 'Low-emphasis actions: toolbars, table rows, card headers.',
  },
  {
    variant: 'subtle',
    label: 'Subtle',
    usage: 'Tinted low-emphasis action that still reads as branded.',
  },
];

/* `accent` and `destructive` are implemented but have no call site in the
 * product, so they are not documented as live variants. Where a screen needs a
 * dangerous action it builds one by hand from `outline` plus destructive border
 * and text — see the "Destructive actions" example. */

export interface SizeEntry {
  size: ButtonSize;
  label: string;
  height: string;
  usage: string;
}

export const BUTTON_SIZES: SizeEntry[] = [
  { size: 'xs', label: 'xs', height: '28px', usage: 'Table row actions, dense chips' },
  { size: 'sm', label: 'sm', height: '32px', usage: 'The product default in practice — toolbars, page actions, panels' },
  { size: 'md', label: 'md', height: '36px', usage: 'The component default, used where sm would feel cramped' },
  { size: 'lg', label: 'lg', height: '40px', usage: 'Full-width auth form submits — the only place it appears' },
];

/* `icon` is a square shorthand and lives outside the height ladder above, so it
 * gets its own specimen rather than a rung. It reaches the product through
 * ShipmentCard's row-overflow trigger rather than by being typed at a call site.
 *
 * `xl` is implemented and has no call site anywhere, so it is not documented. */

/* ---------------------------------------------------------------------------
 * Guidance
 * ------------------------------------------------------------------------ */

export const BUTTON_GUIDELINES: Guideline[] = [
  {
    do: 'Use exactly one primary button per view, for the action you want the user to take.',
    dont: 'Place several primary buttons side by side — nothing stands out and the hierarchy is lost.',
  },
  {
    do: 'Label with a verb that names the outcome: “Create shipment”, “Assign driver”.',
    dont: 'Use vague labels such as “OK”, “Submit” or “Yes” that only make sense next to the question.',
  },
  {
    do: 'Build a dangerous action from outline plus destructive border and text, and confirm it first.',
    dont: 'Style an ordinary action red because it feels important.',
  },
  {
    do: 'Set isLoading while an action is in flight so it cannot be fired twice.',
    dont: 'Leave a button live during a request and rely on the backend to reject duplicates.',
  },
  {
    do: 'Use IconButton for icon-only controls so an accessible name is required.',
    dont: 'Drop an icon into Button with no label — screen readers announce nothing.',
  },
  {
    do: 'Render navigation as <Button asChild><Link/></Button> so it is a real anchor.',
    dont: 'Use onClick={() => navigate(...)} on a button — it breaks middle-click and “open in new tab”.',
  },
  {
    do: 'Keep the size consistent within a group; pick the size from the surrounding density.',
    dont: 'Mix sizes inside one toolbar or button group.',
  },
  {
    do: 'Override spacing or width through className when a layout needs it.',
    dont: 'Add colour overrides via className — that is a missing variant, not a one-off. Around twenty call sites currently break this rule, including one that paints a button with bg-success; they are drift, not precedent.',
  },
  {
    do: 'Use shape="pill" with size="sm" and a leading Plus for a page-header create action — that is the house pattern.',
    dont: 'Invent a different treatment for the same job on a new page.',
  },
];

export const BUTTON_ACCESSIBILITY: string[] = [
  'Renders a native <button>, so Enter and Space activate it and it participates in form submission without extra code.',
  'The focus ring is part of the base styles and uses the --ring token at a 2px offset. It is never removed, only themed.',
  'IconButton requires aria-label at the type level — an icon-only control cannot compile without an accessible name.',
  'isLoading sets aria-busy and disables the control, so assistive technology announces the pending state and the action cannot be repeated.',
  'Disabled buttons use the disabled attribute. With asChild — where an anchor ignores it — aria-disabled is set instead and pointer events are removed.',
  'type defaults to "button", so a button inside a form never submits it by accident. Pass type="submit" deliberately.',
  'Buttons in an attached ButtonGroup raise their z-index on focus, so the ring is never clipped by a neighbouring segment.',
  'Colour is never the only signal: variants differ in fill, border and weight, so the hierarchy survives greyscale and colour-blindness.',
  'Icons are aria-hidden and pointer-events-none; the label carries the accessible name.',
];

/* ---------------------------------------------------------------------------
 * API reference
 * ------------------------------------------------------------------------ */

export const BUTTON_PROPS: PropDefinition[] = [
  {
    name: 'variant',
    type: "'primary' | 'secondary' | 'outline' | 'ghost' | 'subtle' | 'accent' | 'destructive'",
    defaultValue: "'primary'",
    description:
      'Visual style. Each variant defines its own hover and active states. The product uses five of the seven; accent and destructive have no call site.',
  },
  {
    name: 'size',
    type: "'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'icon'",
    defaultValue: "'md'",
    description: 'Size step. The product uses xs, sm, md and lg; xl and icon have no call site.',
  },
  {
    name: 'shape',
    type: "'default' | 'pill'",
    defaultValue: "'default'",
    description: 'Corner treatment. "pill" fully rounds the ends.',
  },
  {
    name: 'fullWidth',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Stretches the button to fill its container. Used in drawers and mobile footers.',
  },
  {
    name: 'isLoading',
    type: 'boolean',
    defaultValue: 'false',
    description:
      'Swaps the leading icon for a spinner, disables the control and sets aria-busy.',
  },
  {
    name: 'loadingText',
    type: 'ReactNode',
    description:
      'Replaces the label while loading. A genuine accessibility affordance that no screen has adopted yet — every isLoading call site passes the boolean alone.',
  },
  {
    name: 'leadingIcon',
    type: 'ReactNode',
    description: 'Icon before the label. Replaced by the spinner while loading.',
  },
  {
    name: 'trailingIcon',
    type: 'ReactNode',
    description: 'Icon after the label. Use for disclosure chevrons and external-link markers.',
  },
  {
    name: 'asChild',
    type: 'boolean',
    defaultValue: 'false',
    description:
      'Renders the child element with button styling instead of a <button>. Use for router links. Requires a single element child.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Blocks interaction. Prefer explaining why in adjacent text or a tooltip.',
  },
  {
    name: 'type',
    type: "'button' | 'submit' | 'reset'",
    defaultValue: "'button'",
    description: 'Defaults to "button" so a button inside a form cannot submit unintentionally.',
  },
  {
    name: 'className',
    type: 'string',
    description:
      'Merged last via cn(), so layout overrides win. Use for spacing and width, never for colour.',
  },
];

export const ICON_BUTTON_PROPS: PropDefinition[] = [
  {
    name: 'aria-label',
    type: 'string',
    required: true,
    description: 'Accessible name. Required — there is no visible label to fall back on.',
  },
  {
    name: 'variant',
    type: 'ButtonVariant',
    defaultValue: "'ghost'",
    description: 'Same variant set as Button. Only ghost and outline appear in the product.',
  },
  {
    name: 'size',
    type: "'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'icon'",
    defaultValue: "'md'",
    description: 'Squared at every step, so the control is always a perfect square. Every call site in the product passes "sm".',
  },
  {
    name: 'asChild',
    type: 'boolean',
    defaultValue: 'false',
    description:
      'Renders the child with icon-button styling. This is how the contact header ships tel: and mailto: links as real anchors.',
  },
  {
    name: 'icon',
    type: 'ReactNode',
    description: 'The icon, as an alternative to passing it as children.',
  },
  {
    name: 'isLoading',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Replaces the icon with a spinner and blocks interaction.',
  },
  {
    name: 'shape',
    type: "'default' | 'pill'",
    defaultValue: "'default'",
    description: '"pill" produces a circular button, as used by the header notification bell.',
  },
];

/**
 * The product contains exactly one ButtonGroup — the segmented shipment filter
 * — and it passes only `role` and `aria-label`. `attached` is documented anyway
 * because its default is the reason that group renders as a single segmented
 * control. `orientation` and `spacing` have never been called and are left out.
 */
export const BUTTON_GROUP_PROPS: PropDefinition[] = [
  {
    name: 'attached',
    type: 'boolean',
    defaultValue: 'true',
    description:
      'Joins the buttons into a segmented control with one shared border. The default, and the reason the shipment filter reads as a single control.',
  },
  {
    name: 'role',
    type: "'group' | 'toolbar'",
    defaultValue: "'group'",
    description: 'Use "toolbar" for a bar of controls; "group" for a set of related actions.',
  },
  {
    name: 'aria-label',
    type: 'string',
    description: 'Names the group for assistive technology. Always provide one.',
  },
];
