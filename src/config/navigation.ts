import {
  BarChart3,
  Package,
  Building2,
  CalendarDays,
  Clock,
  Compass,
  Container,
  FileText,
  Globe,
  Landmark,
  LayoutDashboard,
  Palette,
  Receipt,
  Repeat,
  Route,
  Settings,
  ShieldCheck,
  TrendingUp,
  Truck,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from '@/design-system/icons';


import { ROUTES } from '@/config/routes';
import type { NavItem, NavSection } from '@/types';

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
        label: 'Empty Return',
        icon: Repeat,
        children: [
          {
            id: 'empty-return-dashboard',
            label: 'Dashboard',
            // "Dashboard" only reads correctly under the group; the trail needs
            // the module's own name so `/empty-returns/cycles` is not
            // "Dashboard › Dashboard › Cycles".
            breadcrumbLabel: 'Empty Return',
            path: ROUTES.emptyReturns,
            icon: LayoutDashboard,
          },
          {
            id: 'empty-return-cycles',
            label: 'Cycles & Chains',
            path: ROUTES.emptyReturnsCycles,
            icon: Repeat,
          },
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
        id: 'partners-group',
        label: 'Partners',
        icon: Building2,
        children: [
          {
            id: 'partners',
            label: 'Partners Overview',
            path: ROUTES.partners,
            icon: Building2,
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
     * Finance is two views: the working-capital overview, and the shipment
     * book — client → project → booking — split by origination channel. Its
     * own section rather than a collapsible group because both are daily
     * destinations that should cost one click each.
     */
    id: 'finance',
    label: 'Finance',
    items: [
      {
        id: 'finance-overview',
        label: 'Overview',
        breadcrumbLabel: 'Finance',
        path: ROUTES.finance,
        icon: Wallet,
      },
      {
        id: 'finance-shipments',
        label: 'Shipments',
        path: ROUTES.financeShipments,
        icon: Package,
        matchNested: true,
      },
      {
        id: 'finance-invoices',
        label: 'Invoices',
        path: ROUTES.financeInvoices,
        icon: Receipt,
        matchNested: true,
      },
      {
        id: 'finance-accounts',
        label: 'Accounts',
        path: ROUTES.financeAccounts,
        icon: Landmark,
        matchNested: true,
      },
      {
        id: 'finance-funding',
        label: 'Funding',
        path: ROUTES.financeFunding,
        icon: TrendingUp,
        matchNested: true,
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

/**
 * Returns navigation tree customized by user role.
 * For Shipper role, returns a streamlined workspace menu pointing to their own account pages.
 */
export function getNavigationForUser(user: { role?: string; shipperId?: string } | null): NavSection[] {
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

  return NAVIGATION;
}
