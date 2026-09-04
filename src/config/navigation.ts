import {
  ArrowLeftRight,
  ListChecks,
  MessageSquare,
  BarChart3,
  Building2,
  CalendarDays,
  Clock,
  Coins,
  Compass,
  Container,
  FileText,
  Folder,
  Globe,
  Handshake,
  LayoutDashboard,
  Leaf,
  Link2,
  Palette,
  Receipt,
  Repeat,
  Route,
  Settings,
  ShieldCheck,
  Ticket,
  Truck,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from '@/design-system/icons';


import { permissionsForPath } from '@/config/permissions';
import { ROUTES } from '@/config/routes';
import type { NavItem, NavSection } from '@/types';
import { hasAnyPermission, toGrantList } from '@/utils';

/**
 * The single source of truth for application navigation.
 *
 * Drives the sidebar, the breadcrumb trail and the document title. Registering
 * a new module is a matter of adding one entry to a section below — the layout
 * components read this tree and require no changes.
 *
 * Groups (entries with `children`) may also carry their own `path`; when they
 * do, the group row navigates and expands.
 */
export const NAVIGATION: NavSection[] = [
  {
    id: 'overview',
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        path: ROUTES.dashboard,
        icon: LayoutDashboard,
      },
    ],
  },
  /*
   * Workspace sits directly under the Dashboard, above Operations, because it
   * is where the day starts: what was handed to me overnight, and what is
   * still open. Everything below it is a place you go on purpose.
   */
  {
    id: 'workspace',
    label: 'Workspace',
    items: [
      {
        /*
         * One row, not a tree of four.
         *
         * "My Tasks", "Assigned by Me" and "All Tasks" were the same list with
         * a different fixed filter — three nav rows for one screen, and the
         * page already carries a filter band that answers the same question
         * better. Whose work you want is now a control on the page (`?scope=`)
         * and "Recurring & Templates" sits behind the page's gear, where a
         * standing arrangement belongs — it describes work that does not exist
         * yet, which is not something to put beside the work that does.
         */
        id: 'workspace-tasks',
        label: 'Tasks',
        path: ROUTES.workspaceTasks,
        icon: ListChecks,
        matchNested: true,
      },
      {
        /*
         * Tickets, beside Tasks rather than inside it.
         *
         * The two lists answer different questions to different people: the
         * board is "what am I doing today", and most of what is on it has no
         * customer behind it. This is "who is waiting on us", and its empty
         * state is a good day — which is never true of the board.
         */
        id: 'workspace-tickets',
        label: 'Tickets',
        path: ROUTES.workspaceTickets,
        icon: Ticket,
        matchNested: true,
      },
      {
        id: 'workspace-messages',
        /* The team's own word for it. Not an integration — this is Workspace's
           own channels and DMs, and nothing here talks to Slack the product. */
        label: 'Slack',
        path: ROUTES.workspaceMessages,
        icon: MessageSquare,
        /* Every conversation lives under this one row. */
        matchNested: true,
      },
      {
        /*
         * The compliance register and the shared file tree: what is expired,
         * what is expiring, what was never filed, and the folders the team
         * keeps for itself.
         *
         * It sat under Partners while it was only the four dossiers, on the
         * grounds that three of the papers it watches belong to a transporter,
         * its trucks or its drivers. The Files half broke that — those folders
         * are the team's, not a partner's — and Drive is somewhere you go
         * every day rather than a subsection of one directory. Last in
         * Workspace: the other three rows are work waiting on you, this is
         * where you go to look something up.
         *
         * Named "Fleetin Drive" rather than "Documents" — HR has its own
         * Documents entry (it issues contracts and payslips), and two
         * unrelated items reading the same word in one sidebar is a coin-toss
         * for anybody looking for either.
         */
        id: 'documents',
        label: 'Fleetin Drive',
        path: ROUTES.documents,
        icon: Folder,
        matchNested: true,
      },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      {
        id: 'shipments',
        label: 'Shipments',
        path: ROUTES.shipmentsList,
        icon: Compass,
        matchNested: true,
      },
      /*
       * Empty Return is its own group, not a child of Shipments, because it is
       * a five-view module in its own right — the demo's left rail, transplanted.
       * The group carries no `path`: `isBranchActive` lights it from whichever
       * child matches, and `SidebarNavItem` expands it on arrival. Children match
       * exactly on purpose — `/empty-returns` is Dashboard alone, so opening
       * Cycles does not leave two rows lit.
       */
      {
        id: 'empty-return',
        label: 'Empty Container',
        icon: Repeat,
        children: [
          {
            id: 'empty-return-tower',
            label: 'Control Tower',
            // "Control Tower" only reads correctly under the group; the trail
            // needs the module's own name so `/empty-returns/cycles` is not
            // "Control Tower › Control Tower › Cycles".
            breadcrumbLabel: 'Empty Container',
            path: ROUTES.emptyReturns,
            icon: Repeat,
          },
          // No Calendar row: the planning calendar moved to the Shipments
          // page as a tab on 2026-08-29 — it plans shipments, so it belongs
          // beside them. `/empty-returns/calendar` now redirects there.
          {
            id: 'empty-return-matching',
            label: 'Matching',
            path: ROUTES.emptyReturnsMatching,
            icon: ArrowLeftRight,
          },
          {
            id: 'empty-return-cycles',
            /* "Cycles / Chains", not "Cycles". The page shows both and the
               operator asks for it by either word: a cycle is one box's trip,
               a chain is the run of cycles a carrier strung together. Naming
               only the smaller of the two sent people looking for "chains"
               through the other three pages first. */
            label: 'Cycles / Chains',
            path: ROUTES.emptyReturnsCycles,
            icon: Link2,
          },
          // No Dashboard row. `/empty-returns/performance` is still a live
          // route, but the user has removed this link TWICE (2026-08-29) — once
          // after a review flagged the page as unreachable, and again after the
          // v19 restore put it back. The absence is the decision: do not
          // re-add it because v19's sidebar lists it.
        ],
      },
      {
        id: 'shippers',
        label: 'Shippers',
        path: ROUTES.shippers,
        icon: Building2,
        matchNested: true,
      },
      {
        /* Not `Building2` — that is the SHIPPER's glyph, and a shipper and a
           transporter are opposite ends of the same job. A haulier is a company
           we contract with, so it takes the handshake; its trucks and drivers
           keep their own marks below it. */
        id: 'partners-group',
        label: 'Partners',
        icon: Handshake,
        children: [
          {
            id: 'partners',
            label: 'Partners Overview',
            path: ROUTES.partners,
            icon: Handshake,
            matchNested: true,
          },
          {
            id: 'vehicles',
            label: 'Vehicles',
            path: ROUTES.vehicles,
            icon: Truck,
            matchNested: true,
          },
          {
            id: 'drivers',
            label: 'Drivers',
            path: ROUTES.drivers,
            icon: UserRound,
            matchNested: true,
          },
        ],
      },
    ],
  },
  {
    /*
     * Carbon, on its own.
     *
     * A section rather than a row under Operations, because it is not a view
     * of the shipment book: it reads across every container any transporter
     * ran, and the question it answers ("how clean is this fleet") belongs to
     * a different person on a different day from "where is my box".
     *
     * One item, and the section is named for the subject while the row is
     * named for the figure — the sidebar never says the same word twice.
     */
    id: 'sustainability',
    label: 'Sustainability',
    items: [
      {
        id: 'emissions',
        label: 'CO₂ Emissions',
        path: ROUTES.emissions,
        icon: Leaf,
        matchNested: true,
      },
    ],
  },
  {
    /*
     * Finance is the money, both ways. Billing, invoices and projects are what
     * a shipment earns; Expenses is what the company spends running itself.
     *
     * Its own section rather than a collapsible group because each is a daily
     * destination that should cost one click — and because Expenses is the one
     * row here a driver or a warehouse hand will see, the section filter
     * (which reads `permissionsForPath`) has to be able to show it alone.
     */
    id: 'finance',
    label: 'Finance',
    items: [
      {
        id: 'finance-billing',
        label: 'Billing',
        breadcrumbLabel: 'Finance',
        path: ROUTES.finance,
        icon: Wallet,
      },
      {
        id: 'finance-invoices',
        label: 'Invoices',
        path: ROUTES.financeInvoices,
        icon: Receipt,
        matchNested: true,
      },
      {
        id: 'finance-projects',
        label: 'Projects',
        path: ROUTES.financeProjects,
        icon: Folder,
        matchNested: true,
      },
      {
        id: 'finance-expenses',
        label: 'Expenses',
        path: ROUTES.financeExpenses,
        icon: Coins,
      },
    ],
  },
  {
    /*
     * HR & Payroll. Its own section rather than a group under Organisation
     * because payroll, leave and document generation are each a daily
     * destination, and the module replaced an Excel workbook whose users
     * expect to reach any of them in one click.
     */
    id: 'hr',
    label: 'HR & Payroll',
    items: [
      {
        id: 'hr-overview',
        label: 'Overview',
        breadcrumbLabel: 'HR',
        path: ROUTES.hr,
        icon: Users,
      },
      {
        id: 'hr-employees',
        label: 'Employees',
        path: ROUTES.hrEmployees,
        icon: UserRound,
        matchNested: true,
      },
      {
        id: 'hr-payroll',
        label: 'Payroll',
        path: ROUTES.hrPayroll,
        icon: Receipt,
        matchNested: true,
      },
      {
        id: 'hr-leave',
        label: 'Leave',
        path: ROUTES.hrLeave,
        icon: CalendarDays,
        matchNested: true,
      },
      {
        id: 'hr-documents',
        label: 'Documents',
        path: ROUTES.hrDocuments,
        icon: FileText,
        matchNested: true,
      },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      {
        id: 'administration',
        label: 'Administration',
        path: ROUTES.administration,
        icon: ShieldCheck,
        matchNested: true,
      },
      {
        id: 'settings',
        label: 'Settings',
        path: ROUTES.settings,
        icon: Settings,
        matchNested: true,
      },
      {
        id: 'design-system',
        label: 'Design System',
        path: ROUTES.designSystem,
        icon: Palette,
        matchNested: true,
      },
    ],
  },
];

/** Flattened view of the tree, parents before children. Built once at module load. */
export const NAV_ITEMS_FLAT: NavItem[] = NAVIGATION.flatMap((section) =>
  section.items.flatMap(function flatten(item: NavItem): NavItem[] {
    return [item, ...(item.children?.flatMap(flatten) ?? [])];
  }),
);

/** Path -> nav item, for breadcrumb and page-title lookups. */
export const NAV_ITEMS_BY_PATH: ReadonlyMap<string, NavItem> = new Map(
  NAV_ITEMS_FLAT.filter((item): item is NavItem & { path: string } => Boolean(item.path)).map(
    (item) => [item.path, item],
  ),
);

/** Icons available to navigation entries, re-exported for typed config authoring. */
export type NavIcon = LucideIcon;

/** The slice of the session this module reads. */
export interface NavUser {
  role?: string;
  shipperId?: string;
  /** Grants as issued by the API — `string[]`, wildcards included. */
  permissions?: unknown;
}

/**
 * Returns the navigation tree for one session.
 *
 * Two filters, in order. The portal roles (SHIPPER, CLIENT, TRANSPORTER) get a
 * different tree entirely — their own workspace, not a subset of the internal
 * one. Everybody else gets the internal tree with the rows their permissions
 * do not reach removed.
 *
 * That second step is the one that was missing: `NavItem.permissions` has been
 * in the model since Phase 1 marked it "enforced once auth exists", and until
 * now nothing read it — so an account with twelve permissions was shown the
 * same sidebar as an administrator and met a 403 on every row it clicked.
 */
export function getNavigationForUser(user: NavUser | null): NavSection[] {
  if (user?.role === 'SHIPPER' || user?.role === 'CLIENT') {
    const sId = user.shipperId || 'SHP-101';
    const shipperPath = `/shippers/${sId}`;
    return [
      {
        id: 'shipper-workspace',
        label: 'Shipper Portal',
        items: [
          {
            id: 'shipper-dashboard',
            label: 'Dashboard',
            path: ROUTES.shipperDashboard,
            icon: LayoutDashboard,
          },
          {
            id: 'shipper-shipments',
            label: 'Active & Past Shipments',
            path: `${shipperPath}?tab=shipments`,
            icon: Compass,
          },
          {
            id: 'shipper-analytics',
            label: 'Analytics',
            path: ROUTES.analytics,
            icon: BarChart3,
          },
          {
            id: 'empty-returns',
            label: 'Empty Returns',
            path: ROUTES.emptyReturns,
            icon: Container,
            matchNested: true,
          },
        ],
      },
      {
        id: 'account',
        label: 'Account',
        items: [
          {
            id: 'settings',
            label: 'Account Settings',
            path: `${shipperPath}?tab=profile`,
            icon: Settings,
          },
        ],
      },
    ];
  }

  if (user?.role === 'TRANSPORTER') {
    const analytics = ROUTES.transporterAnalytics;
    return [
      {
        id: 'transporter-workspace',
        label: 'Transporter Portal',
        items: [
          {
            id: 'transporter-dashboard',
            label: 'Dashboard',
            path: ROUTES.transporterDashboard,
            icon: LayoutDashboard,
          },
          {
            id: 'transporter-analytics',
            label: 'Analytics',
            path: analytics,
            icon: BarChart3,
          },
          {
            id: 'transporter-operations',
            label: 'Fleet & Backhaul',
            path: `${analytics}?tab=operations`,
            icon: Route,
          },
          {
            id: 'transporter-delays',
            label: 'Delays & Waiting',
            path: `${analytics}?tab=delays`,
            icon: Clock,
          },
          {
            id: 'transporter-drivers',
            label: 'Drivers',
            path: `${analytics}?tab=drivers`,
            icon: Users,
          },
          {
            id: 'transporter-payments',
            label: 'Payments',
            path: `${analytics}?tab=payments`,
            icon: Wallet,
          },
          {
            id: 'transporter-network',
            label: 'Network Standing',
            path: `${analytics}?tab=network`,
            icon: Globe,
          },
          {
            id: 'transporter-trips',
            label: 'Trip Reports',
            path: `${analytics}?tab=trips`,
            icon: FileText,
          },
        ],
      },
      {
        id: 'account',
        label: 'Account',
        items: [
          {
            id: 'settings',
            label: 'Account Settings',
            path: ROUTES.settings,
            icon: Settings,
          },
        ],
      },
    ];
  }

  return filterNavigationByGrants(NAVIGATION, toGrantList(user?.permissions));
}

/**
 * What a nav row needs, in order of specificity.
 *
 * An explicit `permissions` on the item wins; otherwise the requirement is
 * whatever its route needs, so the sidebar and the route guard cannot disagree
 * about a screen. A group with no path of its own requires nothing directly —
 * it survives on its children.
 */
function requirementFor(item: NavItem): readonly string[] {
  if (item.permissions) return item.permissions;
  if (item.path) return permissionsForPath(item.path);
  return [];
}

/**
 * Drops rows, groups and whole sections the grants cannot reach.
 *
 * A group survives on its children: an account holding `vehicles.view` but not
 * `partners.view` still needs the Partners group in order to reach Vehicles.
 * What it loses is the group's own destination — the row is stripped back to a
 * plain expander rather than a link onto a page that would refuse it.
 */
export function filterNavigationByGrants(sections: NavSection[], grants: string[]): NavSection[] {
  const keep = (item: NavItem): NavItem | null => {
    const allowedSelf = hasAnyPermission(grants, requirementFor(item));
    const children = item.children
      ?.map(keep)
      .filter((child): child is NavItem => child !== null);

    if (children && children.length > 0) {
      return { ...item, children, path: allowedSelf ? item.path : undefined };
    }

    /* A leaf, or a group left with nothing under it. Either way it is only
       worth showing if it goes somewhere this account may open. */
    if (!allowedSelf || !item.path) return null;
    return { ...item, children: undefined };
  };

  return sections
    .map((section) => ({
      ...section,
      items: section.items.map(keep).filter((item): item is NavItem => item !== null),
    }))
    .filter((section) => section.items.length > 0);
}
