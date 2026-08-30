import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { useReducer, useRef, useState } from 'react';

import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  IconChip,
  ScrollArea,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
  Skeleton,
  Spinner,
  Tooltip,
} from '@/design-system';
import {
  Bell,
  Calendar,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Clock,
  X,
} from '@/design-system/icons';
import {
  GuidelineList,
  PropsTable,
  ShowcaseExample,
  ShowcaseGrid,
  ShowcasePanel,
  ShowcaseSection,
  ShowcaseSubsection,
  type PropDefinition,
} from '@/design-system/showcase';
import { ErrorBoundary } from '@/components/feedback/ErrorBoundary';
import { RouteLoader } from '@/components/feedback/RouteLoader';

/**
 * Section 14 — Overlays & Feedback.
 *
 * Everything that renders above the page, plus the states a page shows while it
 * has nothing to render yet. Two of these entries document a gap rather than a
 * component: the product has no centred-dialog primitive and no toast
 * primitive, so both are hand-rolled, and the copies have already drifted apart.
 * Naming the drift is the point — the next module should copy the recipe below
 * rather than invent a fourth one.
 */
export function OverlaysSection() {
  return (
    <ShowcaseSection
      id="overlays"
      index="14"
      title="Overlays & Feedback"
      description="Sheet is the only overlay primitive the design system ships, and it carries almost all of the product's overlay traffic: fourteen application files mount it for detail drawers, create forms, quick views and the mobile navigation. Centred modals and toasts have no primitive at all and are built by hand where they are needed. This section documents both halves honestly — the primitives as they are, and the two hand-rolled patterns as the shapes they have settled into."
    >
      <SheetSubsection />
      <CentredModalSubsection />
      <ToastSubsection />
      <TooltipSubsection />
      <DropdownMenuSubsection />
      <SkeletonSubsection />
      <SpinnerSubsection />
      <ErrorBoundarySubsection />
      <ShellPrimitivesSubsection />
    </ShowcaseSection>
  );
}

/* ────────────────────────────── 1 · Sheet ────────────────────────────── */

const SHEET_CONTENT_PROPS: PropDefinition[] = [
  {
    name: 'side',
    type: "'left' | 'right' | 'top' | 'bottom'",
    defaultValue: "'left'",
    description:
      'Edge the panel is anchored to. The app uses right for every detail panel and create form, and left exactly once, for the mobile navigation drawer. top and bottom exist in the variant map but no screen uses them.',
  },
  {
    name: 'hideCloseButton',
    type: 'boolean',
    defaultValue: 'false',
    description:
      'Removes the built-in close affordance. Pass it only when the panel supplies its own close control, or when the panel is edge-to-edge content that the default button would sit on top of.',
  },
  {
    name: 'open',
    type: 'boolean',
    description:
      'Set on the Sheet root, not on the content. Every app call site drives it from state so the trigger can live anywhere on the page.',
  },
  {
    name: 'onOpenChange',
    type: '(open: boolean) => void',
    description:
      'Fires for the close button, the overlay click and Escape. The panel cannot be closed without it.',
  },
  {
    name: 'className',
    type: 'string',
    description:
      'A right-side sheet is w-full sm:max-w-md by default — the house width, set on the variant so every side popup matches without retyping it. Override only for a panel that genuinely needs the room: w-full sm:max-w-2xl for analytics drill-downs and the document viewer, w-72 for the navigation drawer.',
  },
];

function SheetSubsection() {
  const [detailOpen, setDetailOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <ShowcaseSubsection
      title="Sheet"
      description="An edge-anchored panel built on Radix Dialog. It is the only component in the system that brings the full dialog contract — focus trap, scroll lock, Escape handling and aria-modal — so anything that must take over the screen should be a Sheet unless there is a reason it cannot be."
    >
      <div className="space-y-3">
        <ShowcaseExample
          title="Right sheet — the detail panel"
          description="Twenty of the twenty-one Sheet mounts in the product use side='right'. It is the shape of every quick view, record form and drill-down."
          code={`<Sheet open={open} onOpenChange={setOpen}>
  <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-6">
    <SheetTitle>Shipment SHP-8901</SheetTitle>
    <SheetDescription>Container 40ft · Jebel Ali to Muscat</SheetDescription>
  </SheetContent>
</Sheet>`}
        >
          <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                Open detail sheet
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full overflow-y-auto p-6 sm:max-w-md">
              <SheetTitle>Shipment SHP-8901</SheetTitle>
              <SheetDescription>Container 40ft · Jebel Ali to Muscat</SheetDescription>

              <dl className="mt-4 space-y-2.5">
                {[
                  ['Status', 'Pending dispatch'],
                  ['Booked', 'Aug 5, 2026'],
                  ['Estimated cost', '$4,200'],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-baseline justify-between gap-3 border-b border-border-subtle pb-2"
                  >
                    <dt className="type-caption text-muted-foreground">{label}</dt>
                    <dd className="type-body-sm text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            </SheetContent>
          </Sheet>
        </ShowcaseExample>

        <ShowcaseExample
          title="Left sheet — the mobile navigation drawer"
          description="The one left-side mount in the product. It hides the built-in close button because the panel is edge-to-edge, and it wraps the title and description in VisuallyHidden because the drawer's own branding is the visible heading."
          code={`<SheetContent side="left" className="w-72 gap-0 p-0" hideCloseButton>
  <VisuallyHidden asChild>
    <SheetTitle>Navigation</SheetTitle>
  </VisuallyHidden>
  <VisuallyHidden asChild>
    <SheetDescription>Application modules and settings</SheetDescription>
  </VisuallyHidden>
  <Sidebar isCollapsed={false} onNavigate={onNavigate} />
</SheetContent>`}
        >
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                Open navigation drawer
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 gap-0 p-0" hideCloseButton>
              <VisuallyHidden asChild>
                <SheetTitle>Navigation</SheetTitle>
              </VisuallyHidden>
              <VisuallyHidden asChild>
                <SheetDescription>Application modules and settings</SheetDescription>
              </VisuallyHidden>

              {/* Stand-in for the real Sidebar, which needs router and auth
                  context the showcase does not provide. */}
              <div className="flex h-full flex-col gap-1 bg-primary p-4 text-primary-foreground">
                <p className="type-label pb-3 opacity-80">Sidebar stands here</p>
                {['Dashboard', 'Shipments', 'Partners', 'Finance'].map((label) => (
                  <span key={label} className="rounded-md px-2.5 py-2 type-body-sm">
                    {label}
                  </span>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </ShowcaseExample>
      </div>

      <ShowcasePanel className="space-y-2">
        <h4 className="type-h4 text-foreground">A title and a description are not optional</h4>
        <p className="type-body-sm text-muted-foreground">
          Radix Dialog warns at runtime when a panel has no accessible name, and a screen-reader
          user who lands inside an unnamed focus trap has no way to know what they are in. Every
          Sheet in the product therefore carries a <code className="type-mono">SheetTitle</code> and
          a <code className="type-mono">SheetDescription</code>. When the panel's own header already
          says the same thing, the app keeps them and hides them — either with{' '}
          <code className="type-mono">className="sr-only"</code>, which is what the record pages do,
          or by wrapping them in{' '}
          <code className="type-mono">VisuallyHidden</code>, which is what the navigation drawer
          does. Both are correct; neither is skippable.
        </p>
      </ShowcasePanel>

      <div className="space-y-2">
        <h4 className="type-h4 text-foreground">SheetContent props</h4>
        <PropsTable props={SHEET_CONTENT_PROPS} />
      </div>

      <GuidelineList
        guidelines={[
          {
            do: 'Reach for a Sheet first. It is the only overlay in the system that already traps focus, locks scroll and closes on Escape.',
            dont: 'Hand-roll a fixed-position panel because a Sheet felt heavy. The weight is the accessibility contract.',
          },
          {
            do: 'Take the default width on a right-side sheet and set only padding. Widen with className only where the content needs it, and stay on the widths already in use: sm:max-w-2xl for drill-downs, w-72 for the nav drawer.',
            dont: 'Invent a new width per screen. Four different detail-panel widths make the product feel like four products.',
          },
          {
            do: 'Drive open from state and handle onOpenChange, so the overlay click and Escape close the panel too.',
            dont: 'Rely on a close button alone. A panel that only closes one way is a trap on a touch device.',
          },
        ]}
      />
    </ShowcaseSubsection>
  );
}

/* ─────────────────────── 2 · Centred modal (a gap) ─────────────────────── */

function CentredModalSubsection() {
  return (
    <ShowcaseSubsection
      title="Centred modal — no primitive exists"
      description="There is no Dialog folder under primitives, so the two centred modals in the product were both improvised, and they do not agree. One portals itself and uses the z-overlay and bg-overlay tokens; the other renders in place with a raw z-50 and a raw black scrim, and has no role='dialog' and no focus trap. The shape below is the one that is closer to correct."
    >
      <ShowcaseExample
        title="The recipe, drawn in place"
        description="Rendered inside a bounded box rather than over the page, because this is a shape the product repeats and not a component you can import."
        layout="bare"
        canvas
        code={`createPortal(
  <div className="fixed inset-0 z-overlay flex items-center justify-center p-4 bg-overlay/60 backdrop-blur-[2px]">
    <div role="dialog" aria-modal="true" aria-labelledby="modal-title"
         className="w-full max-w-3xl rounded-lg border border-border bg-card shadow-2xl">
      …
    </div>
  </div>,
  document.body,
)`}
      >
        <div className="relative h-72 overflow-hidden rounded-md border border-border bg-surface-sunken">
          <div className="p-4">
            <div className="space-y-2">
              <Skeleton shape="text" className="w-40" />
              <Skeleton shape="block" className="h-20 w-full" />
            </div>
          </div>

          <div className="absolute inset-0 flex items-center justify-center bg-overlay/60 p-4 backdrop-blur-[2px]">
            <div className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
              <div className="flex items-start justify-between gap-3 border-b border-border bg-surface-sunken/40 px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <IconChip icon={Clock} tint="orange" size={36} />
                  <div>
                    <p className="type-body-sm font-bold text-foreground">Pending shipments</p>
                    <p className="type-caption text-muted-foreground">
                      Awaiting dispatch, driver or documents
                    </p>
                  </div>
                </div>
                <span className="rounded-md p-1.5 text-muted-foreground">
                  <X className="size-4" aria-hidden />
                </span>
              </div>
              <div className="space-y-2 p-5">
                <Skeleton shape="text" className="w-full" />
                <Skeleton shape="text" className="w-4/5" />
                <Skeleton shape="text" className="w-2/3" />
              </div>
            </div>
          </div>
        </div>
      </ShowcaseExample>

      <ShowcasePanel className="space-y-2">
        <h4 className="type-h4 text-foreground">What the two copies disagree about</h4>
        <p className="type-body-sm text-muted-foreground">
          The empty-returns recommendations modal portals into{' '}
          <code className="type-mono">document.body</code>, uses the semantic{' '}
          <code className="type-mono">z-overlay</code> and{' '}
          <code className="type-mono">bg-overlay</code> tokens and marks itself{' '}
          <code className="type-mono">role="dialog"</code>. The shipper console's pending-shipments
          modal renders inline, hardcodes <code className="type-mono">z-50</code> and a raw{' '}
          <code className="type-mono">bg-black/60</code> scrim, and carries no dialog role. The raw
          z-index is the more dangerous of the two: it sits outside the layer scale, so whether it
          covers a sticky tab bar is an accident rather than a decision. A documented modal would
          have settled this; until one exists, copy the recipe above.
        </p>
      </ShowcasePanel>

      <GuidelineList
        guidelines={[
          {
            do: 'Ask whether the content is really centred. A record, a form or a preview belongs in a right Sheet, which already solves focus and scroll.',
            dont: 'Reach for a centred modal by habit. Only two screens in the product genuinely need one.',
          },
          {
            do: 'Portal to the body, scrim with bg-overlay, layer with z-overlay, and label the dialog with the id of its own heading.',
            dont: 'Hardcode z-50 or a raw black scrim. Both step outside the layer and colour scales and neither follows the theme.',
          },
        ]}
      />
    </ShowcaseSubsection>
  );
}

/* ────────────────────────── 3 · Toast (a gap) ────────────────────────── */

function ToastSubsection() {
  return (
    <ShowcaseSubsection
      title="Toast — no primitive, three copies"
      description="The z-toast layer token exists and is used, so the system half-acknowledges toasts and then ships nothing. The finance and empty-returns module chromes render the same toast twice, near byte-for-byte; the create-shipment flow renders a third variant, and the shipper detail page renders a fourth thing entirely — an inline card rather than a floating one. This is the clearest extraction candidate in the system."
    >
      <ShowcaseExample
        title="The confirmation toast"
        description="Shown here in place. In the app the card is wrapped in fixed inset-x-4 bottom-5 z-toast, centred below sm and pinned to sm:right-6 above it."
        layout="bare"
        canvas
        code={`{toast !== null && (
  <div role="status" aria-live="polite"
       className="fixed inset-x-4 bottom-5 z-toast flex justify-center sm:inset-x-auto sm:right-6 sm:justify-end">
    <div className="flex max-w-md items-start gap-3 rounded-card border border-border bg-surface-raised px-4 py-3 shadow-card">
      <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <p className="type-body-sm text-foreground">{toast}</p>
      <button type="button" onClick={dismissToast} aria-label="Dismiss notification">…</button>
    </div>
  </div>
)}`}
      >
        <div className="flex justify-end">
          <div className="flex max-w-md items-start gap-3 rounded-card border border-border bg-surface-raised px-4 py-3 shadow-card">
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <p className="type-body-sm text-foreground">
              Payout scheduled. DJF 1,240,000 leaves the pool in 48 hours.
            </p>
            <span className="-mr-1 -mt-0.5 shrink-0 rounded-sm p-1 text-muted-foreground">
              <X className="size-3.5" aria-hidden />
            </span>
          </div>
        </div>
      </ShowcaseExample>

      <ShowcasePanel className="space-y-2">
        <h4 className="type-h4 text-foreground">Why the mark is always a check</h4>
        <p className="type-body-sm text-muted-foreground">
          Every message either store emits confirms something the operator has just done, so the
          leading glyph never varies and never needs a colour decision — it is{' '}
          <code className="type-mono">CircleCheck</code> in{' '}
          <code className="type-mono">text-primary</code>. A toast is not the place for a failure:
          an action that failed leaves the operator with a decision to make, and a message that
          disappears on its own is the wrong surface for a decision. Keep failures on the page.
        </p>
        <p className="type-body-sm text-muted-foreground">
          One renderer per module, mounted in the module's layout route so it survives navigation
          between views, with the message itself held in the module store. That is what finance and
          empty-returns both do. It should be promoted to a primitive before a fifth module invents
          a fifth variant.
        </p>
      </ShowcasePanel>
    </ShowcaseSubsection>
  );
}

/* ───────────────────────────── 4 · Tooltip ───────────────────────────── */

const TOOLTIP_PROPS: PropDefinition[] = [
  {
    name: 'content',
    type: 'ReactNode',
    required: true,
    description:
      'The tooltip body. An empty string, null or undefined renders the trigger with no tooltip attached, so a conditional label needs no conditional wrapper.',
  },
  {
    name: 'side',
    type: "'top' | 'right' | 'bottom' | 'left'",
    defaultValue: "'top'",
    description:
      'side="right" is the app default in the collapsed sidebar rail, where a top tooltip would be clipped by the panel edge.',
  },
  {
    name: 'align',
    type: "'start' | 'center' | 'end'",
    defaultValue: "'center'",
    description: 'Alignment along the chosen side.',
  },
  {
    name: 'sideOffset',
    type: 'number',
    defaultValue: '8',
    description: 'Gap between the trigger and the tooltip, in pixels.',
  },
  {
    name: 'delayDuration',
    type: 'number',
    description:
      'Overrides the provider timing for this one tooltip. Leave unset so hover timing stays consistent across the app.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Skips the wrapper entirely and renders the child alone.',
  },
];

function TooltipSubsection() {
  return (
    <ShowcaseSubsection
      title="Tooltip and TooltipProvider"
      description="Thirteen application files use Tooltip, mostly to label icon-only controls in the header and the collapsed sidebar rail. The wrapper form — a trigger plus a string — is what nearly every call site wants; the composable Radix parts are exported for the rare tooltip that needs its own open state."
    >
      <ShowcaseExample
        title="Sides"
        description="The trigger is any element; Tooltip clones it with asChild, so the child keeps its own semantics."
        code={`<Tooltip content="Notifications">
  <IconButton aria-label="Notifications" size="sm" shape="pill">
    <Bell />
  </IconButton>
</Tooltip>`}
      >
        <Tooltip content="Opens above — the default">
          <Button variant="outline" size="sm">
            side="top"
          </Button>
        </Tooltip>
        <Tooltip content="Opens beside — used by the collapsed sidebar rail" side="right">
          <Button variant="outline" size="sm">
            side="right"
          </Button>
        </Tooltip>
        <Tooltip content="Notifications" side="bottom">
          <Button variant="ghost" size="icon" aria-label="Notifications">
            <Bell />
          </Button>
        </Tooltip>
      </ShowcaseExample>

      <ShowcasePanel className="space-y-2">
        <h4 className="type-h4 text-foreground">The provider is required</h4>
        <p className="type-body-sm text-muted-foreground">
          A Tooltip rendered outside a <code className="type-mono">TooltipProvider</code> throws.
          The app mounts exactly one, in <code className="type-mono">AppProviders</code>, inside the
          query provider and around the whole router:{' '}
          <code className="type-mono">
            &lt;TooltipProvider delayDuration={'{300}'} skipDelayDuration={'{150}'}&gt;
          </code>
          . Those two numbers are why tooltips feel the way they do across the product: 300ms before
          the first one opens, and a 150ms grace window in which moving to a neighbouring control
          opens its tooltip immediately rather than waiting again. Set them per-tooltip only when a
          single control genuinely needs different timing.
        </p>
      </ShowcasePanel>

      <div className="space-y-2">
        <h4 className="type-h4 text-foreground">Tooltip props</h4>
        <PropsTable props={TOOLTIP_PROPS} />
      </div>
    </ShowcaseSubsection>
  );
}

/* ────────────────────────── 5 · DropdownMenu ────────────────────────── */

const TIMEFRAMES = [
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'quarter', label: 'This quarter' },
  { value: 'ytd', label: 'Year to date' },
];

function DropdownMenuSubsection() {
  const [timeframe, setTimeframe] = useState('last30');

  return (
    <ShowcaseSubsection
      title="DropdownMenu — the timeframe picker"
      description="The menu is exported as composable parts rather than a configured component, because menus differ too much between call sites for a props API to stay honest. The single-select radio form below is how every timeframe control in the shipper console works, and it is the variant the page has never shown."
    >
      <ShowcaseExample
        title="DropdownMenuRadioGroup"
        description="A radio group keeps the current choice visible in the menu itself, which a list of plain items cannot do. The pill trigger with a leading calendar glyph is the shape both console pickers use."
        code={`<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <button className="…rounded-full border border-border bg-surface px-4 py-2…">
      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
      <span>{DATE_PRESET_LABELS[preset]}</span>
      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
    </button>
  </DropdownMenuTrigger>

  <DropdownMenuContent align="end" className="w-64 p-2">
    <DropdownMenuRadioGroup value={preset} onValueChange={onPresetChange}>
      {PRESETS.map((option) => (
        <DropdownMenuRadioItem key={option} value={option}>
          {DATE_PRESET_LABELS[option]}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  </DropdownMenuContent>
</DropdownMenu>`}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Calendar className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                {TIMEFRAMES.find((option) => option.value === timeframe)?.label ?? 'Last 30 days'}
              </span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-64 p-2">
            <DropdownMenuRadioGroup value={timeframe} onValueChange={setTimeframe}>
              {TIMEFRAMES.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </ShowcaseExample>

      <ShowcasePanel className="space-y-2">
        <h4 className="type-h4 text-foreground">Radio, checkbox and plain items</h4>
        <p className="type-body-sm text-muted-foreground">
          <code className="type-mono">DropdownMenuRadioItem</code> indents its label to leave room
          for a filled dot in the primary colour, and{' '}
          <code className="type-mono">DropdownMenuCheckboxItem</code> does the same with a check —
          so a menu that mixes selection items with plain actions needs{' '}
          <code className="type-mono">inset</code> on the plain ones to keep the labels aligned. The
          action-menu form of this component, with labels, separators and the destructive item
          variant, is documented in the Buttons section.
        </p>
      </ShowcasePanel>
    </ShowcaseSubsection>
  );
}

/* ──────────────────────────── 6 · Skeleton ──────────────────────────── */

const SKELETON_PROPS: PropDefinition[] = [
  {
    name: 'shape',
    type: "'text' | 'block' | 'circle'",
    defaultValue: "'block'",
    description:
      'text fixes a 4-unit height and a small radius, so a row of them reads as sentences; block takes its height from className and is the placeholder for charts, maps and tiles. Both are in use across the app; circle is not.',
  },
  {
    name: 'variant',
    type: "'shimmer' | 'pulse' | 'static'",
    defaultValue: "'shimmer'",
    description:
      'No app file passes this — every loading state in the product is the default shimmer. pulse carries its own motion-reduce guard; static is the escape hatch for a placeholder inside something that already animates.',
  },
  {
    name: 'className',
    type: 'string',
    description:
      'Where width and, for blocks, height are set. The placeholder should match the real content it replaces: a 28-unit heading placeholder above a 24-unit line, not a uniform grid of bars.',
  },
];

function SkeletonSubsection() {
  return (
    <ShowcaseSubsection
      title="Skeleton"
      description="Eleven application files compose their own loading states from this one primitive — every analytics section, the BI chart card, the KPI card and the cover map. There are no shared skeleton compositions in use, and that is fine: a placeholder only helps if it has the shape of the thing arriving, which is a per-panel decision."
    >
      <ShowcaseGrid minColumnWidth="18rem">
        <ShowcaseExample
          title="shape='text'"
          description="Fixed height, small radius. Vary the widths — equal-length bars do not read as prose."
          layout="column"
          code={`<Skeleton shape="text" className="h-3 w-24" />`}
        >
          <div className="w-full space-y-2">
            <Skeleton shape="text" className="w-full" />
            <Skeleton shape="text" className="w-11/12" />
            <Skeleton shape="text" className="w-2/3" />
          </div>
        </ShowcaseExample>

        <ShowcaseExample
          title="shape='block'"
          description="Height comes from className. This is the chart, map and tile placeholder."
          layout="column"
          code={`<Skeleton shape="block" className="h-48 w-full" />`}
        >
          <div className="w-full space-y-2">
            <Skeleton shape="text" className="w-28" />
            <Skeleton shape="block" className="h-24 w-full" />
          </div>
        </ShowcaseExample>
      </ShowcaseGrid>

      <ShowcasePanel className="space-y-2">
        <h4 className="type-h4 text-foreground">The placeholder is not what gets announced</h4>
        <p className="type-body-sm text-muted-foreground">
          Skeleton renders <code className="type-mono">role="presentation"</code> and{' '}
          <code className="type-mono">aria-hidden</code>, because a screen reader reading out six
          empty boxes tells the user nothing. The loading state is announced by the container
          instead — put <code className="type-mono">aria-busy</code> on the panel that is waiting,
          which is what the route loader does.
        </p>
      </ShowcasePanel>

      <div className="space-y-2">
        <h4 className="type-h4 text-foreground">Skeleton props</h4>
        <PropsTable props={SKELETON_PROPS} />
      </div>
    </ShowcaseSubsection>
  );
}

/* ───────────────────── 7 · Spinner and RouteLoader ───────────────────── */

const SPINNER_PROPS: PropDefinition[] = [
  {
    name: 'size',
    type: "'xs' | 'sm' | 'md' | 'lg' | 'xl'",
    defaultValue: "'md'",
    description: 'lg is the route-loader size; the smaller steps sit inside buttons and rows.',
  },
  {
    name: 'intent',
    type: "'primary' | 'muted' | 'current'",
    defaultValue: "'primary'",
    description:
      'current inherits the surrounding text colour, which is what a spinner inside a filled button needs.',
  },
  {
    name: 'label',
    type: 'string',
    defaultValue: "'Loading'",
    description:
      'Rendered visually hidden inside the role="status" wrapper. Say what is loading — "Loading page" beats "Loading".',
  },
];

function SpinnerSubsection() {
  return (
    <ShowcaseSubsection
      title="Spinner and the route loader"
      description="Skeleton covers the case where the shape of the answer is known. The spinner covers the case where it is not — chiefly the moment between clicking a nav item and the route's chunk arriving, which is the loading state a user sees most often in this product."
    >
      <div className="space-y-3">
        <ShowcaseExample
          title="Sizes and intents"
          description="Always announced: the component wraps the glyph in role='status' with a visually hidden label."
          code={`<Spinner size="lg" label="Loading page" />
<Spinner size="sm" intent="current" />`}
        >
          <Spinner size="xs" label="Loading" />
          <Spinner size="sm" label="Loading" />
          <Spinner size="md" label="Loading" />
          <Spinner size="lg" label="Loading" />
          <Spinner size="xl" label="Loading" />
          <span className="text-muted-foreground">
            <Spinner size="md" intent="current" label="Loading" />
          </span>
        </ShowcaseExample>

        <ShowcaseExample
          title="RouteLoader"
          description="The Suspense fallback behind every lazily loaded route. It claims a minimum height so the shell does not collapse and then snap back when the chunk lands."
          layout="bare"
          canvas
          code={`<Suspense fallback={<RouteLoader />}>
  <Outlet />
</Suspense>`}
        >
          <div className="flex min-h-48 rounded-md border border-dashed border-border">
            <RouteLoader className="min-h-48" />
          </div>
        </ShowcaseExample>
      </div>

      <div className="space-y-2">
        <h4 className="type-h4 text-foreground">Spinner props</h4>
        <PropsTable props={SPINNER_PROPS} />
      </div>
    </ShowcaseSubsection>
  );
}

/* ───────────────────────── 8 · ErrorBoundary ───────────────────────── */

function BoomOnce({ armed }: { armed: { current: boolean } }) {
  if (armed.current) {
    // Disarmed before throwing, so the boundary's own "Try again" restores this
    // subtree instead of throwing again on the very next render.
    armed.current = false;
    throw new Error('Demo: this panel failed to render.');
  }

  return (
    <p className="p-6 type-body-sm text-muted-foreground">
      This panel is rendering normally. Trigger the error to see the fallback.
    </p>
  );
}

function ErrorBoundarySubsection() {
  const armed = useRef(false);
  const [, rerender] = useReducer((count: number) => count + 1, 0);

  return (
    <ShowcaseSubsection
      title="ErrorBoundary"
      description="Mounted twice: once around the whole router, and once per route inside the app layout, keyed on the pathname so an error on one screen does not follow the user to the next. It is also available around a single feature panel, so one broken widget cannot blank the page around it."
    >
      <ShowcaseExample
        title="The default fallback"
        description="The real boundary, wrapping a child that throws on demand. In development the fallback also prints the error message; in production it does not."
        layout="bare"
        canvas
        code={`<ErrorBoundary key={pathname}>
  <Suspense fallback={<RouteLoader />}>
    <Outlet />
  </Suspense>
</ErrorBoundary>`}
      >
        <div className="space-y-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              armed.current = true;
              rerender();
            }}
          >
            Throw a render error
          </Button>

          <div className="flex rounded-md border border-dashed border-border">
            <ErrorBoundary>
              <BoomOnce armed={armed} />
            </ErrorBoundary>
          </div>
        </div>
      </ShowcaseExample>

      <ShowcasePanel className="space-y-2">
        <h4 className="type-h4 text-foreground">Retry does two different things</h4>
        <p className="type-body-sm text-muted-foreground">
          For an ordinary render error, <span className="font-medium">Try again</span> clears the
          caught error and re-renders the subtree. For a failed dynamic import — a message
          containing <code className="type-mono">dynamically imported module</code> or{' '}
          <code className="type-mono">Failed to fetch</code> — it reloads the window instead. That
          case is almost always a deploy that has replaced the chunk the open tab is still asking
          for, and no amount of re-rendering will conjure a file that no longer exists on the
          server.
        </p>
        <p className="type-body-sm text-muted-foreground">
          The fallback is marked <code className="type-mono">role="alert"</code> so it is announced
          when it replaces the content, and it opens with an{' '}
          <code className="type-mono">IconChip</code> in the red tint — the same chip that opens
          every card in the product, so an error reads as part of the system rather than as a crash
          screen.
        </p>
      </ShowcasePanel>
    </ShowcaseSubsection>
  );
}

/* ────────────── 9 · ScrollArea, Collapsible and Separator ────────────── */

const SCROLL_AREA_PROPS: PropDefinition[] = [
  {
    name: 'orientation',
    type: "'vertical' | 'horizontal' | 'both'",
    defaultValue: "'vertical'",
    description: 'Which scrollbars are rendered. The sidebar uses the vertical default.',
  },
  {
    name: 'viewportClassName',
    type: 'string',
    description:
      'Classes applied to the inner viewport instead of the outer root. Padding belongs here: put it on the root and the content scrolls out from under it, leaving a gap the scrollbar sits in. The sidebar passes viewportClassName="px-3 py-4" for exactly this reason.',
  },
  {
    name: 'className',
    type: 'string',
    description: 'Classes for the outer root — sizing and flex behaviour, not padding.',
  },
];

function ShellPrimitivesSubsection() {
  const [open, setOpen] = useState(false);

  return (
    <ShowcaseSubsection
      title="ScrollArea, Collapsible and Separator"
      description="Three small primitives with one consumer each, all of them in the application shell — which means they render on every authenticated screen in the product. None of them had ever appeared on this page."
    >
      <ShowcaseGrid minColumnWidth="19rem">
        <ShowcaseExample
          title="ScrollArea"
          description="Themed scrollbars instead of the OS default. The sidebar navigation is the one consumer."
          layout="column"
          code={`<ScrollArea className="flex-1" viewportClassName="px-3 py-4">
  <nav aria-label="Main navigation">…</nav>
</ScrollArea>`}
        >
          <ScrollArea
            className="h-40 w-full rounded-md border border-border bg-surface-sunken"
            viewportClassName="px-3 py-4"
          >
            <ul className="space-y-1.5">
              {[
                'Dashboard',
                'Shipments',
                'Empty returns',
                'Partners',
                'Shippers',
                'Vehicles',
                'Drivers',
                'Finance',
                'Analytics',
                'Administration',
              ].map((label) => (
                <li key={label} className="type-body-sm text-muted-foreground">
                  {label}
                </li>
              ))}
            </ul>
          </ScrollArea>
        </ShowcaseExample>

        <ShowcaseExample
          title="Collapsible"
          description="The expanding navigation groups in the sidebar. The height animation is driven by Radix's own measured height, so the content does not need a fixed size."
          layout="column"
          code={`<Collapsible open={isOpen} onOpenChange={toggle}>
  <CollapsibleTrigger>…</CollapsibleTrigger>
  <CollapsibleContent>…</CollapsibleContent>
</Collapsible>`}
        >
          <Collapsible open={open} onOpenChange={setOpen} className="w-full">
            <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 type-body-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <span className="flex-1 text-left">Operations</span>
              <ChevronRight
                className={`size-4 shrink-0 transition-transform duration-normal ease-emphasized ${
                  open ? 'rotate-90' : ''
                }`}
                aria-hidden
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="mt-1 ml-4 space-y-1 border-l border-border pl-2.5">
                {['Shipments', 'Empty returns', 'Missions'].map((label) => (
                  <li key={label} className="type-body-sm text-muted-foreground">
                    {label}
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        </ShowcaseExample>
      </ShowcaseGrid>

      <ShowcaseExample
        title="Separator"
        description="A themed rule. Decorative by default, so assistive technology skips it; pass decorative={false} when the divide itself carries meaning, such as splitting two unrelated groups in a list."
        code={`<Separator orientation="vertical" className="h-6" />`}
      >
        <div className="flex w-full flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="type-body-sm text-muted-foreground">Breadcrumbs</span>
            <Separator orientation="vertical" className="h-6" />
            <span className="type-body-sm text-muted-foreground">Account menu</span>
          </div>
          <Separator />
          <span className="type-caption text-muted-foreground">
            Vertical above — the header's own divider. Horizontal below it.
          </span>
        </div>
      </ShowcaseExample>

      <div className="space-y-2">
        <h4 className="type-h4 text-foreground">ScrollArea props</h4>
        <PropsTable props={SCROLL_AREA_PROPS} />
      </div>
    </ShowcaseSubsection>
  );
}
