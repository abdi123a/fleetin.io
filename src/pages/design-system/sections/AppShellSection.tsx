import { useLayoutEffect, useRef, useState } from 'react';

import { Logo, ThemeToggle } from '@/components';
import { Avatar, Badge, IconButton, Separator } from '@/design-system';
import {
  BarChart3,
  Bell,
  Building2,
  ChevronDown,
  ChevronRight,
  Container,
  Gauge,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Truck,
  UserRound,
  Users,
  type LucideIcon,
} from '@/design-system/icons';
import {
  GuidelineList,
  PropsTable,
  ShowcaseExample,
  ShowcaseGrid,
  ShowcasePanel,
  ShowcaseSection,
  ShowcaseSubsection,
  SpecRow,
  type PropDefinition,
} from '@/design-system/showcase';
import { SlidingIndicator, type Rect } from '@/layouts/app-layout/components/SlidingIndicator';
import { cn } from '@/utils';

/**
 * Section 13 — Application Shell.
 *
 * The frame every authenticated screen sits in, including this page. The shell
 * lives in `src/layouts/app-layout/` and depends on the router, the UI store and
 * the auth store, so mounting `Sidebar` or `Header` inside the showcase would
 * crash. The specimens below are static recreations built from the same token
 * classes as the real files; each one names the file it mirrors. Where a piece
 * has no such dependency — `SlidingIndicator`, `ThemeToggle` — the real
 * component is mounted.
 */

/* ---------------------------------------------------------------------------
 * 1. Shell anatomy
 * ------------------------------------------------------------------------- */

function ShellAnatomySubsection() {
  return (
    <ShowcaseSubsection
      title="Shell anatomy"
      description="One layout wraps every authenticated route. Pages supply content through an Outlet and never re-implement chrome, so a page cannot accidentally ship its own header or its own idea of the content width."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <ShowcaseExample
          title="Fixed sidebar, padded content column"
          description="Mirrors src/layouts/app-layout/AppLayout.tsx. The sidebar is fixed and the content column is offset by a matching left padding rather than sitting in a flex row beside it."
          layout="bare"
          canvas
        >
          <div className="overflow-hidden rounded-md border border-border">
            <div className="flex min-h-[15rem]">
              <div className="flex w-24 shrink-0 flex-col justify-between bg-sidebar p-2 text-center sm:w-32">
                <span className="type-caption font-semibold text-sidebar-foreground">
                  aside
                  <br />
                  fixed · z-sidebar
                </span>
                <span className="type-caption text-sidebar-muted-foreground">w-sidebar</span>
              </div>

              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex h-12 shrink-0 items-center justify-between border-b border-header-border bg-header/95 px-3 backdrop-blur-sm">
                  <span className="type-caption font-semibold text-foreground">
                    header · sticky · z-header
                  </span>
                  <span className="type-caption text-muted-foreground">h-header</span>
                </div>

                <div className="flex flex-1 items-center justify-center bg-background p-3">
                  <div className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-border-strong bg-surface p-4 text-center">
                    <span className="type-caption text-muted-foreground">
                      main · px-4 py-6 lg:px-6 lg:py-8
                      <br />
                      inner wrapper · mx-auto w-full max-w-content
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ShowcaseExample>

        <ShowcasePanel>
          <h4 className="type-h4 text-foreground">Layout metrics</h4>
          <p className="mt-1 type-body-sm text-muted-foreground">
            Four values drive the whole frame. They are exposed as Tailwind spacing and container
            names, so the width of the sidebar and the padding that offsets the content can never
            drift apart.
          </p>
          <dl className="mt-4 space-y-2.5">
            <SpecRow label="w-sidebar">
              <code className="type-mono text-primary">16.5rem · 264px</code>
            </SpecRow>
            <SpecRow label="w-sidebar-collapsed">
              <code className="type-mono text-primary">4.5rem · 72px</code>
            </SpecRow>
            <SpecRow label="h-header">
              <code className="type-mono text-primary">3.75rem · 60px</code>
            </SpecRow>
            <SpecRow label="max-w-content">
              <code className="type-mono text-primary">100rem · 1600px</code>
            </SpecRow>
          </dl>
        </ShowcasePanel>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <ShowcasePanel>
          <h4 className="type-h4 text-foreground">Why the sidebar is fixed</h4>
          <p className="mt-1.5 type-body-sm text-muted-foreground">
            A sidebar in the document flow scrolls with the page and reflows the content when its
            width animates. Taking it out of flow and offsetting the content with{' '}
            <code className="type-mono text-primary">lg:pl-sidebar</code> keeps the panel still and
            leaves the content&rsquo;s own scroll position untouched through the collapse
            transition.
          </p>
        </ShowcasePanel>

        <ShowcasePanel>
          <h4 className="type-h4 text-foreground">Scroll reset on navigation</h4>
          <p className="mt-1.5 type-body-sm text-muted-foreground">
            The layout calls <code className="type-mono text-primary">window.scrollTo</code> on every
            pathname change. Without it a deep-scrolled table carries its offset into the next route
            and the new page opens halfway down.
          </p>
        </ShowcasePanel>

        <ShowcasePanel>
          <h4 className="type-h4 text-foreground">Error boundary keyed on the route</h4>
          <p className="mt-1.5 type-body-sm text-muted-foreground">
            The per-route boundary is keyed on the pathname, so React remounts it on navigation. A
            boundary that keeps its state would leave one broken page showing its error message on
            every route the user visits afterwards.
          </p>
        </ShowcasePanel>
      </div>

      <GuidelineList
        guidelines={[
          {
            do: 'Let the layout own the header, the sidebar and the content width; a page renders only its own content.',
            dont: 'Add a second sticky bar or a page-level max-width that competes with max-w-content.',
          },
          {
            do: 'Reach for the named layout utilities — w-sidebar, h-header, max-w-content — when a page needs to align to the shell.',
            dont: 'Hard-code 264px or 60px in a page; the two copies will fall out of step the first time the shell changes.',
          },
        ]}
      />
    </ShowcaseSubsection>
  );
}

/* ---------------------------------------------------------------------------
 * 2. Sidebar
 * ------------------------------------------------------------------------- */

const SIDEBAR_TOKENS: { token: string; swatch: string; role: string }[] = [
  {
    token: '--sidebar',
    swatch: 'bg-sidebar',
    role: 'The panel itself. Aliased to --primary, so the sidebar is the brand colour at full strength.',
  },
  {
    token: '--sidebar-foreground',
    swatch: 'bg-sidebar-foreground',
    role: 'Body text and idle icons. White.',
  },
  {
    token: '--sidebar-muted-foreground',
    swatch: 'bg-sidebar-muted-foreground',
    role: 'Section captions — the one step down from the foreground that stays readable on teal.',
  },
  {
    token: '--sidebar-border',
    swatch: 'bg-sidebar-border',
    role: 'Rules, dividers and the child-indent line. Lighter than the panel, never darker.',
  },
  {
    token: '--sidebar-item-hover',
    swatch: 'bg-sidebar-item-hover',
    role: 'Hover fill. Darker than the panel, so a hover reads as a press rather than a highlight.',
  },
  {
    token: '--sidebar-item-active',
    swatch: 'bg-sidebar-item-active',
    role: 'The active pill, painted by SlidingIndicator underneath the row.',
  },
  {
    token: '--sidebar-item-marker',
    swatch: 'bg-sidebar-item-marker',
    role: 'The 3.5px bar at the left edge of the active row.',
  },
];

type NavRowState = 'idle' | 'active' | 'branch';

const ROW_BASE =
  'relative z-10 flex w-full items-center gap-2.5 rounded-md py-2 pl-2.5 pr-2 type-body tracking-tight transition-colors duration-fast ease-out';

const ROW_STATE: Record<NavRowState, string> = {
  idle: 'font-semibold text-sidebar-foreground hover:bg-sidebar-item-hover hover:text-sidebar-item-hover-foreground',
  active: 'font-bold text-sidebar-item-active-foreground',
  branch: 'font-bold text-sidebar-item-hover-foreground hover:bg-sidebar-item-hover',
};

const ICON_STATE: Record<NavRowState, string> = {
  idle: 'text-sidebar-foreground',
  active: 'text-sidebar-item-active-foreground',
  branch: 'text-sidebar-item-hover-foreground',
};

interface DemoNavItem {
  label: string;
  icon: LucideIcon;
  badge?: number;
}

const DEMO_NAV: DemoNavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Shipments', icon: Package },
  { label: 'Transporters', icon: Truck },
  { label: 'Drivers', icon: Users, badge: 4 },
  { label: 'Shippers', icon: Building2 },
];

/** Named, rather than indexed off DEMO_NAV, so the three-states specimen below never risks an out-of-bounds read. */
const NAV_STATE_DEMO_ITEMS: Record<NavRowState, DemoNavItem> = {
  idle: { label: 'Dashboard', icon: LayoutDashboard },
  active: { label: 'Shipments', icon: Package },
  branch: { label: 'Transporters', icon: Truck },
};

/**
 * The expanded panel, with the real SlidingIndicator measuring the selected row.
 * Everything else is a recreation of src/layouts/app-layout/components/Sidebar.tsx
 * and SidebarNavItem.tsx — the originals read the router and the UI store.
 */
function SidebarPanelSpecimen() {
  const navRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(1);
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    const container = navRef.current;
    const row = rowRefs.current[activeIndex];
    if (!container || !row) return;

    const containerRect = container.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    setRect({
      top: rowRect.top - containerRect.top,
      left: rowRect.left - containerRect.left,
      width: rowRect.width,
      height: rowRect.height,
    });
  }, [activeIndex]);

  return (
    <div className="flex w-sidebar shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="relative flex min-h-[4.25rem] shrink-0 items-center justify-start border-b border-sidebar-border px-5 py-3.5 pr-14">
        <Logo size="2xl" variant="white" />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <IconButton
            aria-label="Collapse sidebar"
            size="sm"
            className="text-sidebar-foreground hover:bg-sidebar-item-hover hover:text-sidebar-item-hover-foreground"
          >
            <PanelLeftClose />
          </IconButton>
        </div>
      </div>

      <div className="flex-1 px-3 py-4">
        <div ref={navRef} className="relative space-y-1">
          <div className="mb-2 flex items-center gap-2.5 px-2.5 pt-1">
            <span className="type-label font-bold tracking-widest text-sidebar-muted-foreground">
              Operations
            </span>
            <span className="h-px flex-1 bg-sidebar-border" />
          </div>

          <SlidingIndicator rect={rect} />

          {DEMO_NAV.map((item, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={item.label}
                type="button"
                ref={(node) => {
                  rowRefs.current[index] = node;
                }}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => setActiveIndex(index)}
                className={cn(ROW_BASE, isActive ? ROW_STATE.active : ROW_STATE.idle)}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                    isActive ? ICON_STATE.active : ICON_STATE.idle,
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                </span>
                <span className="flex-1 truncate text-left">{item.label}</span>
                {item.badge !== undefined && (
                  <Badge
                    size="sm"
                    intent={isActive ? 'primary' : 'default'}
                    className={cn(
                      'ml-auto',
                      !isActive && 'bg-sidebar-item-hover text-sidebar-item-hover-foreground',
                    )}
                  >
                    {item.badge}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex shrink-0 items-center border-t border-sidebar-border p-3">
        <ThemeToggle variant="full" tone="sidebar" />
      </div>
    </div>
  );
}

/** The 72px icon rail. Mirrors Sidebar.tsx with `isCollapsed` true. */
function SidebarRailSpecimen() {
  return (
    <div className="flex w-sidebar-collapsed shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="relative flex min-h-[4.25rem] shrink-0 items-center justify-center border-b border-sidebar-border px-3 py-3.5">
        <Logo iconOnly size="lg" variant="white" />
      </div>

      <div className="flex-1 px-3 py-4">
        <div className="space-y-1">
          <div className="mx-auto my-2 h-px w-6 bg-sidebar-border" aria-hidden />
          {DEMO_NAV.slice(0, 4).map((item, index) => (
            <div
              key={item.label}
              className={cn(
                ROW_BASE,
                'justify-center px-0 py-2',
                index === 1 ? ROW_STATE.active : ROW_STATE.idle,
                index === 1 && 'bg-sidebar-item-active',
              )}
            >
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                  index === 1 ? ICON_STATE.active : ICON_STATE.idle,
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden />
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 justify-center border-t border-sidebar-border px-2 py-3">
        <div className="flex size-8 items-center justify-center rounded-md border border-sidebar-border bg-sidebar-item-hover text-sidebar-foreground">
          <PanelLeftOpen className="size-4 shrink-0" aria-hidden />
        </div>
      </div>
    </div>
  );
}

const SIDEBAR_PROPS: PropDefinition[] = [
  {
    name: 'isCollapsed',
    type: 'boolean',
    required: true,
    description:
      'Switches the panel between the 264px full width and the 72px icon rail. The mobile drawer always passes false — a rail inside a drawer serves no purpose.',
  },
  {
    name: 'onNavigate',
    type: '() => void',
    description:
      'Called after a nav row is followed. The drawer passes its close handler here so it dismisses behind the route transition.',
  },
  { name: 'className', type: 'string', description: 'Merged onto the panel root.' },
];

function SidebarSubsection() {
  return (
    <ShowcaseSubsection
      title="Sidebar"
      description="Flat --primary with white text. That decision is settled and is not re-opened here. One Sidebar body serves both the docked desktop panel and the mobile drawer, so navigation markup exists in exactly one place."
    >
      <ShowcaseExample
        title="Expanded panel and collapsed rail"
        description="A recreation of src/layouts/app-layout/components/Sidebar.tsx — the real component reads the router and the UI store. The active pill and its marker are the real SlidingIndicator; click a row to move it."
        layout="bare"
        canvas
      >
        <div className="overflow-x-auto">
          <div className="flex min-h-[26rem] gap-4">
            <SidebarPanelSpecimen />
            <SidebarRailSpecimen />
          </div>
        </div>
      </ShowcaseExample>

      <div className="space-y-3">
        <h4 className="type-h4 text-foreground">Token family</h4>
        <p className="type-body-sm max-w-3xl text-muted-foreground">
          The panel is a coloured surface, so none of the page roles apply to it.{' '}
          <code className="type-mono text-primary">text-foreground</code> and{' '}
          <code className="type-mono text-primary">text-primary</code> are mixed against white and
          disappear against teal. Every colour inside the sidebar comes from this family instead.
        </p>
        <ShowcaseGrid minColumnWidth="16rem">
          {SIDEBAR_TOKENS.map((entry) => (
            <ShowcasePanel key={entry.token}>
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'size-8 shrink-0 rounded-md border border-border',
                    entry.swatch,
                  )}
                  aria-hidden
                />
                <code className="type-mono min-w-0 truncate text-primary">{entry.token}</code>
              </div>
              <p className="mt-2.5 type-body-sm text-muted-foreground">{entry.role}</p>
            </ShowcasePanel>
          ))}
        </ShowcaseGrid>
      </div>

      <ShowcaseExample
        title="Three nav row states, not two"
        description="Mirrors src/layouts/app-layout/components/SidebarNavItem.tsx. Type is deliberately heavier here than anywhere else in the app — 14px semibold idle, bold active — because a coloured panel eats apparent contrast that a white one gives away for free."
        layout="bare"
      >
        <div className="space-y-4 bg-sidebar p-5">
          <NavStateRow
            state="idle"
            item={NAV_STATE_DEMO_ITEMS.idle}
            caption="Idle — legible on its own; the hover fill only lifts it the last step."
          />
          <NavStateRow
            state="active"
            item={NAV_STATE_DEMO_ITEMS.active}
            caption="Active — the current leaf. It sits on the cream pill, so it takes the pill's inverse."
          />
          <NavStateRow
            state="branch"
            item={NAV_STATE_DEMO_ITEMS.branch}
            caption="Branch-active — a group whose child is the current page. It carries no pill, so it cannot borrow the active colour; dark teal on the teal panel is invisible. It separates from idle by weight and by going the whole way to cream."
          />
        </div>
      </ShowcaseExample>

      <div className="grid gap-6 md:grid-cols-2">
        <ShowcasePanel>
          <h4 className="type-h4 text-foreground">The collapse control changes seat</h4>
          <p className="mt-1.5 type-body-sm text-muted-foreground">
            Expanded, the toggle is parked in the panel&rsquo;s top-right corner and always visible.
            The rail has no corner to spare, so once collapsed it hides and is revealed by hovering
            the logo mark or by focusing the button. The desktop collapse deliberately does not live
            in the header.
          </p>
        </ShowcasePanel>

        <ShowcasePanel>
          <h4 className="type-h4 text-foreground">Captions become a rule on the rail</h4>
          <p className="mt-1.5 type-body-sm text-muted-foreground">
            A section caption has no room at 72px, so the rail replaces it with{' '}
            <code className="type-mono text-primary">
              mx-auto my-2 h-px w-6 bg-sidebar-border
            </code>
            . The grouping survives the collapse even though the words do not. Nested children keep
            their <code className="type-mono text-primary">border-l border-sidebar-border</code>{' '}
            indent line in the expanded panel.
          </p>
        </ShowcasePanel>
      </div>

      <div className="space-y-3">
        <h4 className="type-h4 text-foreground">Sidebar props</h4>
        <PropsTable props={SIDEBAR_PROPS} />
      </div>
    </ShowcaseSubsection>
  );
}

function NavStateRow({
  state,
  item,
  caption,
}: {
  state: NavRowState;
  item: DemoNavItem;
  caption: string;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-center">
      <div className="relative">
        {state === 'active' && (
          <>
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 z-0 rounded-md bg-sidebar-item-active shadow-sm"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute left-0 top-1/2 z-10 h-5 w-[3.5px] -translate-y-1/2 rounded-r-full bg-sidebar-item-marker"
            />
          </>
        )}
        <div className={cn(ROW_BASE, ROW_STATE[state])}>
          <span
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
              ICON_STATE[state],
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" aria-hidden />
          </span>
          <span className="flex-1 truncate text-left">{item.label}</span>
        </div>
      </div>
      <p className="type-caption text-sidebar-muted-foreground">{caption}</p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * 3. SlidingIndicator
 * ------------------------------------------------------------------------- */

const SLIDING_INDICATOR_PROPS: PropDefinition[] = [
  {
    name: 'rect',
    type: '{ top: number; left: number; width: number; height: number } | null',
    required: true,
    description:
      'The active row measured relative to the nav container. Null hides the indicator entirely — which is what happens when the current page sits inside a collapsed group and has no visible row to point at.',
  },
];

function SlidingIndicatorSubsection() {
  return (
    <ShowcaseSubsection
      title="SlidingIndicator"
      description="The marker beside the active nav row. It is a positioned overlay rather than a border on the row itself, which is why it can travel between rows instead of blinking from one to the next."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <ShowcasePanel>
          <h4 className="type-h4 text-foreground">Two layers</h4>
          <p className="mt-1.5 type-body-sm text-muted-foreground">
            A solid pill in <code className="type-mono text-primary">--sidebar-item-active</code>{' '}
            spanning the row, and a 3.5px bar in{' '}
            <code className="type-mono text-primary">--sidebar-item-marker</code> pinned to the left
            edge. The pill is solid rather than faded to transparent: the row&rsquo;s text is the
            inverse of the pill, so a gradient would leave the end of a long label unreadable.
          </p>
          <p className="mt-2.5 type-body-sm text-muted-foreground">
            The bar does not simply slide. It runs a three-keyframe animation where it elongates to
            span both the old and the new row at the halfway point, then contracts back to its
            20px rest height. The stretch is what makes the movement read as one continuous marker
            rather than two separate ones.
          </p>
        </ShowcasePanel>

        <ShowcasePanel>
          <h4 className="type-h4 text-foreground">Motion values</h4>
          <p className="mt-1.5 type-body-sm text-muted-foreground">
            These are hard-coded in the component and have no token equivalent. A second navigation
            elsewhere in the app has to copy them by hand to match, so they are written down here.
          </p>
          <dl className="mt-4 space-y-2.5">
            <SpecRow label="Duration">
              <code className="type-mono text-primary">220ms</code>
            </SpecRow>
            <SpecRow label="Easing">
              <code className="type-mono text-primary">cubic-bezier(0.2, 0, 0, 1)</code>
            </SpecRow>
            <SpecRow label="Bar rest height">
              <code className="type-mono text-primary">20px</code>
            </SpecRow>
            <SpecRow label="Bar width">
              <code className="type-mono text-primary">3.5px</code>
            </SpecRow>
          </dl>
          <p className="mt-3 type-caption text-muted-foreground">
            The easing matches the <code className="type-mono">emphasized</code> curve in the motion
            tokens; the 220ms duration sits between <code className="type-mono">normal</code> and{' '}
            <code className="type-mono">slow</code> and is the one value with no named step.
          </p>
        </ShowcasePanel>
      </div>

      <div className="space-y-3">
        <h4 className="type-h4 text-foreground">SlidingIndicator props</h4>
        <PropsTable props={SLIDING_INDICATOR_PROPS} />
        <p className="type-body-sm text-muted-foreground">
          The component does no measuring of its own. SidebarNav finds the element carrying{' '}
          <code className="type-mono text-primary">aria-current=&quot;page&quot;</code>, measures it
          against the nav container and re-measures on resize, on transition end and whenever the
          route, the collapse state or the expanded groups change. Accessibility markup drives the
          decoration, so the two can never disagree.
        </p>
      </div>
    </ShowcaseSubsection>
  );
}

/* ---------------------------------------------------------------------------
 * 4. Header
 * ------------------------------------------------------------------------- */

const HEADER_PROPS: PropDefinition[] = [
  {
    name: 'onOpenMobileNav',
    type: '() => void',
    required: true,
    description: 'Opens the navigation drawer. The trigger it drives is lg:hidden.',
  },
  { name: 'className', type: 'string', description: 'Merged onto the <header> element.' },
];

function HeaderSubsection() {
  return (
    <ShowcaseSubsection
      title="Header"
      description="A sticky bar 60px tall, translucent over whatever scrolls beneath it. It holds navigation and identity only; nothing about the current page belongs in it, because the page owns its own title block."
    >
      <ShowcaseExample
        title="Composition"
        description="Mirrors src/layouts/app-layout/components/Header.tsx. Slots in order: the mobile drawer trigger, the breadcrumb trail taking the remaining width, then a right cluster of notifications, a vertical rule and the account menu."
        layout="bare"
        canvas
      >
        <div className="overflow-x-auto">
          <div className="min-w-[38rem]">
            <div className="flex h-header shrink-0 items-center gap-3 border-b border-header-border bg-header/95 px-4 backdrop-blur-sm lg:px-6">
              <IconButton aria-label="Open navigation menu" size="sm">
                <Menu />
              </IconButton>

              <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
                <ol className="flex items-center gap-1.5 text-sm">
                  <li className="min-w-0">
                    <span className="block truncate text-muted-foreground">Operations</span>
                  </li>
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <li className="min-w-0">
                    <span className="block truncate text-muted-foreground">Shipments</span>
                  </li>
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <li className="min-w-0">
                    <span
                      aria-current="page"
                      className="block truncate font-medium text-foreground"
                    >
                      FL-2026-0418
                    </span>
                  </li>
                </ol>
              </nav>

              <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                <IconButton aria-label="Notifications" size="sm" shape="pill">
                  <Bell />
                </IconButton>

                <Separator orientation="vertical" className="h-6" />

                <div className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2">
                  <Avatar size="sm" name="Amina Warsame" />
                  <span className="hidden text-left sm:block">
                    <span className="block max-w-[140px] truncate text-sm font-medium leading-tight text-foreground">
                      Amina Warsame
                    </span>
                    <span className="block max-w-[140px] truncate text-2xs font-bold uppercase leading-tight text-primary">
                      Fleetin Logistics
                    </span>
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </div>
              </div>
            </div>
          </div>
        </div>
      </ShowcaseExample>

      <div className="grid gap-6 md:grid-cols-3">
        <ShowcasePanel>
          <h4 className="type-h4 text-foreground">Translucent, not opaque</h4>
          <p className="mt-1.5 type-body-sm text-muted-foreground">
            <code className="type-mono text-primary">bg-header/95</code> with{' '}
            <code className="type-mono text-primary">backdrop-blur-sm</code>. Content passing behind
            the bar stays faintly visible, which is what tells the reader the page is still scrolling
            rather than that it has snapped to a new screen.
          </p>
        </ShowcasePanel>

        <ShowcasePanel>
          <h4 className="type-h4 text-foreground">Collapse lives on the sidebar</h4>
          <p className="mt-1.5 type-body-sm text-muted-foreground">
            The desktop expand/collapse control is not in the header. It belongs to the panel it
            resizes, so it sits on the sidebar logo. The only navigation control the header owns is
            the mobile drawer trigger.
          </p>
        </ShowcasePanel>

        <ShowcasePanel>
          <h4 className="type-h4 text-foreground">Account menu</h4>
          <p className="mt-1.5 type-body-sm text-muted-foreground">
            A rounded-full trigger carrying an Avatar and two lines: the name, then the company or
            role in <code className="type-mono text-primary">text-2xs uppercase font-bold</code>{' '}
            teal. The menu ends in a destructive sign-out styled{' '}
            <code className="type-mono text-primary">text-destructive-subtle-foreground</code> with{' '}
            <code className="type-mono text-primary">focus:bg-destructive-subtle</code> — the pattern
            for any dangerous last item in a menu.
          </p>
        </ShowcasePanel>
      </div>

      <ShowcaseExample
        title="Account menu contents"
        description="A static rendering of the dropdown in src/layouts/app-layout/components/HeaderUserMenu.tsx. The real menu is a DropdownMenu and needs the auth store to name the account."
        layout="bare"
      >
        <div className="p-5">
          <div className="w-56 overflow-hidden rounded-md border border-border bg-surface shadow-md">
            <div className="flex flex-col gap-0.5 px-3 py-2">
              <span className="type-body-sm font-semibold text-foreground">Amina Warsame</span>
              <span className="text-2xs text-muted-foreground">amina@fleetin.com</span>
            </div>
            <div className="h-px bg-border" />
            <div className="flex items-center gap-2 px-3 py-2 type-body-sm text-foreground">
              <UserRound className="size-4 shrink-0" aria-hidden />
              Profile &amp; Account
            </div>
            <div className="flex items-center gap-2 px-3 py-2 type-body-sm text-foreground">
              <Settings className="size-4 shrink-0" aria-hidden />
              Settings
            </div>
            <div className="h-px bg-border" />
            <div className="flex items-center gap-2 bg-destructive-subtle px-3 py-2 type-body-sm text-destructive-subtle-foreground">
              <LogOut className="size-4 shrink-0" aria-hidden />
              Sign Out
            </div>
          </div>
        </div>
      </ShowcaseExample>

      <div className="space-y-3">
        <h4 className="type-h4 text-foreground">Header props</h4>
        <PropsTable props={HEADER_PROPS} />
      </div>
    </ShowcaseSubsection>
  );
}

/* ---------------------------------------------------------------------------
 * 5. Breadcrumbs
 * ------------------------------------------------------------------------- */

const BREADCRUMBS_PROPS: PropDefinition[] = [
  {
    name: 'className',
    type: 'string',
    description:
      'Merged onto the <nav>. The header passes flex-1 so the trail takes the space between the drawer trigger and the account cluster.',
  },
];

function BreadcrumbsSubsection() {
  return (
    <ShowcaseSubsection
      title="Breadcrumbs"
      description="The trail is derived from the URL and the navigation config, never declared by the page. A page that names its own trail can drift out of step with the route it is actually on; a derived trail cannot."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ShowcaseExample
          title="Trail"
          description="Ancestors are muted links that go teal on hover. The last crumb is the current page: font-medium, foreground, and carrying aria-current='page'. It is never a link, because it points at where you already are."
          layout="bare"
        >
          <div className="p-5">
            <nav aria-label="Breadcrumb" className="min-w-0">
              <ol className="flex flex-wrap items-center gap-1.5 text-sm">
                <li className="min-w-0">
                  <span className="block truncate text-muted-foreground">Fleet</span>
                </li>
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <li className="min-w-0">
                  <span className="block truncate text-muted-foreground">Vehicles</span>
                </li>
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <li className="min-w-0">
                  <span aria-current="page" className="block truncate font-medium text-foreground">
                    Trailer TR-118
                  </span>
                </li>
              </ol>
            </nav>
          </div>
        </ShowcaseExample>

        <ShowcasePanel>
          <h4 className="type-h4 text-foreground">Why it is derived</h4>
          <p className="mt-1.5 type-body-sm text-muted-foreground">
            <code className="type-mono text-primary">useBreadcrumbs</code> reads the current path and
            resolves each segment against the navigation config. A page contributes nothing. That
            means adding a route to the config gives it a correct trail for free, and renaming a
            section renames it everywhere at once.
          </p>
          <p className="mt-2.5 type-body-sm text-muted-foreground">
            When the resolver produces nothing — a route outside the navigation tree — the component
            renders null rather than an empty bar, so the header collapses to just its controls.
          </p>
          <p className="mt-2.5 type-body-sm text-muted-foreground">
            Separators are <code className="type-mono text-primary">ChevronRight</code> at{' '}
            <code className="type-mono text-primary">size-3.5</code> and are{' '}
            <code className="type-mono text-primary">aria-hidden</code>; the ordered list already
            carries the structure for a screen reader.
          </p>
        </ShowcasePanel>
      </div>

      <div className="space-y-3">
        <h4 className="type-h4 text-foreground">Breadcrumbs props</h4>
        <PropsTable props={BREADCRUMBS_PROPS} />
      </div>
    </ShowcaseSubsection>
  );
}

/* ---------------------------------------------------------------------------
 * 6. Layering
 * ------------------------------------------------------------------------- */

const Z_SCALE: { name: string; value: string; use: string }[] = [
  { name: 'z-hide', value: '-1', use: 'Pushed behind its own parent.' },
  { name: 'z-base', value: '0', use: 'The default plane.' },
  { name: 'z-raised', value: '10', use: 'Lifted within a card — an overlay badge, a hover affordance.' },
  {
    name: 'z-sticky',
    value: '100',
    use: 'Sticky elements inside the content column, such as a tab bar pinned at top-header.',
  },
  { name: 'z-sidebar', value: '200', use: 'The docked sidebar.' },
  { name: 'z-header', value: '300', use: 'The application header.' },
  { name: 'z-overlay', value: '400', use: 'Scrims behind drawers and dialogs.' },
  { name: 'z-drawer', value: '500', use: 'The mobile navigation drawer and any side sheet.' },
  { name: 'z-modal', value: '600', use: 'Dialogs.' },
  { name: 'z-popover', value: '700', use: 'Popovers, dropdown menus, select lists.' },
  { name: 'z-toast', value: '800', use: 'Transient confirmations. Above a dialog on purpose.' },
  { name: 'z-tooltip', value: '900', use: 'Tooltips. Nothing may cover a tooltip.' },
  { name: 'z-max', value: '9999', use: 'Escape hatch. Using it is an admission the scale was wrong.' },
];

function LayeringSubsection() {
  return (
    <ShowcaseSubsection
      title="Layering"
      description="A z-index scale that is not written down is a z-index scale that gets guessed at. Tailwind has no z-index theme namespace, so the steps are exposed as named utilities — write z-modal, never z-[600]."
    >
      <ShowcasePanel padding="flush">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-border bg-surface-sunken">
                <th scope="col" className="type-label px-4 py-2.5 text-muted-foreground">
                  Utility
                </th>
                <th scope="col" className="type-label px-4 py-2.5 text-muted-foreground">
                  Value
                </th>
                <th scope="col" className="type-label px-4 py-2.5 text-muted-foreground">
                  What sits here
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {Z_SCALE.map((step) => (
                <tr key={step.name}>
                  <td className="px-4 py-2.5">
                    <code className="type-mono text-primary">{step.name}</code>
                  </td>
                  <td className="px-4 py-2.5">
                    <code className="type-mono tabular-nums text-foreground">{step.value}</code>
                  </td>
                  <td className="px-4 py-2.5 type-body-sm text-muted-foreground">{step.use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ShowcasePanel>

      <p className="type-body-sm max-w-3xl text-muted-foreground">
        The gaps between steps are deliberate: a new layer can be inserted between two named ones
        without renumbering the scale. The one relationship worth memorising is that a sticky tab bar
        sits at <code className="type-mono text-primary">z-sticky top-header</code>, and that is only
        correct because the header owns <code className="type-mono text-primary">z-header</code>{' '}
        above it. Pin something to the top of the content column at any higher step and it will slide
        over the header instead of under it.
      </p>
    </ShowcaseSubsection>
  );
}

/* ---------------------------------------------------------------------------
 * 7. ThemeToggle
 * ------------------------------------------------------------------------- */

const THEME_TOGGLE_PROPS: PropDefinition[] = [
  {
    name: 'variant',
    type: "'full' | 'compact' | 'icon'",
    defaultValue: "'full'",
    description:
      'full is the three-way segmented control. compact and icon are the same single-button form, which cycles light to dark to system on each press.',
  },
  {
    name: 'tone',
    type: "'surface' | 'sidebar'",
    defaultValue: "'surface'",
    description:
      "Which surface the control sits on. sidebar swaps to the --sidebar-* roles, because the page's muted greys and sunken fill are mixed for white and turn to mud on the brand panel.",
  },
  { name: 'className', type: 'string', description: 'Merged onto the control root.' },
];

function ThemeToggleSubsection() {
  return (
    <ShowcaseSubsection
      title="ThemeToggle"
      description="The theme control appears in three places: the sidebar footer, the sign-in screen and this page's own header. It is a radiogroup rather than a switch because system is a real third choice, not the absence of the other two."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <ShowcaseExample
          title="Full — page surface"
          description="The default. Labels are visible, so no explanation is needed for what the third option does."
          layout="column"
          code={`<ThemeToggle />`}
        >
          <div className="w-full max-w-sm">
            <ThemeToggle />
          </div>
        </ShowcaseExample>

        <ShowcaseExample
          title="Full — sidebar tone"
          description="The same control on the brand panel. Nothing but the tone changes; the segmented markup and the three options are identical."
          layout="bare"
        >
          <div className="bg-sidebar p-5">
            <ThemeToggle tone="sidebar" />
          </div>
        </ShowcaseExample>

        <ShowcaseExample
          title="Compact — page surface"
          description="One button showing the current mode. Pressing it cycles light, dark, system."
          code={`<ThemeToggle variant="compact" />`}
        >
          <ThemeToggle variant="compact" />
        </ShowcaseExample>

        <ShowcaseExample
          title="Compact — sidebar tone"
          description="What the collapsed 72px rail uses. There is no room for three labelled segments, so the rail takes the cycling form."
          layout="bare"
        >
          <div className="flex justify-center bg-sidebar p-5">
            <ThemeToggle variant="compact" tone="sidebar" />
          </div>
        </ShowcaseExample>
      </div>

      <div className="space-y-3">
        <h4 className="type-h4 text-foreground">ThemeToggle props</h4>
        <PropsTable props={THEME_TOGGLE_PROPS} />
      </div>
    </ShowcaseSubsection>
  );
}

/* ---------------------------------------------------------------------------
 * 8. Underline tab bar
 * ------------------------------------------------------------------------- */

interface DemoTab {
  key: string;
  label: string;
  icon: LucideIcon;
  count?: number;
  countIntent?: 'neutral' | 'critical';
}

const DEMO_TABS: DemoTab[] = [
  { key: 'overview', label: 'Overview', icon: Gauge },
  { key: 'operations', label: 'Operations', icon: MapPin, count: 3, countIntent: 'critical' },
  { key: 'containers', label: 'Containers', icon: Container, count: 18 },
  { key: 'reports', label: 'Reports', icon: BarChart3 },
];

function UnderlineTabBarSpecimen() {
  const listRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState('operations');

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;

    event.preventDefault();
    const index = DEMO_TABS.findIndex((tab) => tab.key === active);
    const next = DEMO_TABS[(index + delta + DEMO_TABS.length) % DEMO_TABS.length];
    if (!next) return;

    setActive(next.key);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-tab-key="${next.key}"]`)?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Tab bar specimen"
      onKeyDown={handleKeyDown}
      className="flex items-center gap-1 overflow-x-auto border-b border-border"
    >
      {DEMO_TABS.map((tab) => {
        const isActive = tab.key === active;
        const isAlert = tab.countIntent === 'critical';
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            data-tab-key={tab.key}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => setActive(tab.key)}
            className={cn(
              'inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5',
              'text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:border-border-strong hover:text-foreground',
            )}
          >
            <tab.icon className="size-4 shrink-0" aria-hidden />
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums',
                  isAlert
                    ? 'bg-destructive-subtle text-destructive-subtle-foreground'
                    : isActive
                      ? 'bg-primary-subtle text-primary-subtle-foreground'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function TabBarSubsection() {
  return (
    <ShowcaseSubsection
      title="Underline tab bar"
      description="Sub-navigation within a page. There is no Tabs primitive in the design system, and the app currently contains five hand-rolled copies of this bar — in the analytics suite, the shipper detail page, the transporter portal, the empty-return cycles page, and the transporter console kit. Four of them share a byte-for-byte identical keyboard handler. The shape is documented here so the sixth one matches the first five instead of inventing a seventh."
    >
      <ShowcaseExample
        title="Shape"
        description="Icon, label, and an optional count pill. Arrow keys move between tabs and only the selected tab is in the tab order — a tablist that responds only to Tab is a list. This specimen is the pattern, not a component: nothing imports it."
        layout="bare"
        canvas
      >
        <div className="p-5">
          <UnderlineTabBarSpecimen />
        </div>
      </ShowcaseExample>

      <div className="grid gap-6 md:grid-cols-3">
        <ShowcasePanel>
          <h4 className="type-h4 text-foreground">Underline, never a pill bar</h4>
          <p className="mt-1.5 type-body-sm text-muted-foreground">
            These views are peers, and a pill bar sitting directly under a filter bar reads as
            another filter. Active is{' '}
            <code className="type-mono text-primary">border-primary text-primary</code>; idle is{' '}
            <code className="type-mono text-primary">border-transparent text-muted-foreground</code>{' '}
            hovering to <code className="type-mono text-primary">border-border-strong</code>.
          </p>
        </ShowcasePanel>

        <ShowcasePanel>
          <h4 className="type-h4 text-foreground">Counts earn their place</h4>
          <p className="mt-1.5 type-body-sm text-muted-foreground">
            A count is shown only when it is worth seeing before you click. Omit it rather than
            passing zero, since a zero badge reads as an unknown. A critical count swaps to{' '}
            <code className="type-mono text-primary">bg-destructive-subtle</code> so an overdue
            figure does not hide inside a neutral pill.
          </p>
        </ShowcasePanel>

        <ShowcasePanel>
          <h4 className="type-h4 text-foreground">Sticky under the header</h4>
          <p className="mt-1.5 type-body-sm text-muted-foreground">
            On tall record pages the bar pins itself with{' '}
            <code className="type-mono text-primary">sticky top-header z-sticky</code> over{' '}
            <code className="type-mono text-primary">bg-background/95 backdrop-blur-sm</code>. Which
            tab you are in is the first thing you lose track of on a long page.
          </p>
        </ShowcasePanel>
      </div>

      <GuidelineList
        guidelines={[
          {
            do: 'Give the tablist an aria-label, mark the selected tab with aria-selected, and keep every unselected tab at tabIndex -1.',
            dont: 'Ship a row of buttons with no role and no arrow-key handling; a keyboard user then has to Tab through every view to reach the last one.',
          },
          {
            do: 'Use the underline bar for peer views of the same record or module.',
            dont: 'Use it as a filter. A filter narrows one view; a tab replaces it.',
          },
        ]}
      />
    </ShowcaseSubsection>
  );
}

/* ---------------------------------------------------------------------------
 * 9. AuthLayout
 * ------------------------------------------------------------------------- */

function AuthLayoutSubsection() {
  return (
    <ShowcaseSubsection
      title="AuthLayout"
      description="The signed-out frame. Sign-in, registration and password recovery all render inside it, so the brand ground is established before the user has an account context of any kind."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <ShowcaseExample
          title="Frame"
          description="Mirrors src/layouts/auth-layout/AuthLayout.tsx at reduced scale. A full-height brand-teal page, one centred card, and a copyright line under it."
          layout="bare"
        >
          <div className="flex min-h-[18rem] flex-col items-center justify-between bg-primary p-4 dark:bg-background sm:p-6">
            <div className="relative z-10 my-auto w-full max-w-[26rem]">
              <div className="overflow-hidden rounded-[2.2rem] border border-border bg-surface shadow-sm dark:shadow-2xl dark:shadow-black/80">
                <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                  <Logo size="2xl" />
                  <p className="type-body-sm text-muted-foreground">
                    The auth screen renders here.
                  </p>
                </div>
              </div>
            </div>
            <p className="z-20 w-full py-3 text-center text-xs font-medium text-white/90 dark:text-muted-foreground">
              © 2026 FLEETIN Internal Management System. All rights reserved.
            </p>
          </div>
        </ShowcaseExample>

        <ShowcasePanel>
          <h4 className="type-h4 text-foreground">What the frame fixes</h4>
          <dl className="mt-3 space-y-2.5">
            <SpecRow label="Page ground">
              <code className="type-mono text-primary">bg-primary dark:bg-background</code>
            </SpecRow>
            <SpecRow label="Card width">
              <code className="type-mono text-primary">max-w-[960px]</code>
            </SpecRow>
            <SpecRow label="Card radius">
              <code className="type-mono text-primary">rounded-[2.2rem]</code>
            </SpecRow>
            <SpecRow label="Card shadow">
              <code className="type-mono text-primary">
                shadow-sm · dark:shadow-2xl shadow-black/80
              </code>
            </SpecRow>
          </dl>
          <p className="mt-3 type-body-sm text-muted-foreground">
            The 2.2rem radius is a one-off and has no step in the radius scale. It is recorded here
            because it is the only place in the product that uses it, and a second auth-adjacent
            screen would otherwise guess.
          </p>
          <p className="mt-2.5 type-body-sm text-muted-foreground">
            In light mode the card floats on the brand colour and the footer text is white; in dark
            mode the ground drops to the page background and the footer takes the muted role, because
            white on near-black is louder than the copyright line deserves.
          </p>
        </ShowcasePanel>
      </div>
    </ShowcaseSubsection>
  );
}

/* ---------------------------------------------------------------------------
 * Section
 * ------------------------------------------------------------------------- */

export function AppShellSection() {
  return (
    <ShowcaseSection
      id="app-shell"
      index="13"
      title="Application Shell"
      description="The frame every authenticated screen sits in, including this one. It is a single layout — sidebar, header, content column — that no page re-implements, plus the navigation patterns that hang off it."
    >
      <ShellAnatomySubsection />
      <SidebarSubsection />
      <SlidingIndicatorSubsection />
      <HeaderSubsection />
      <BreadcrumbsSubsection />
      <LayeringSubsection />
      <ThemeToggleSubsection />
      <TabBarSubsection />
      <AuthLayoutSubsection />
    </ShowcaseSection>
  );
}
