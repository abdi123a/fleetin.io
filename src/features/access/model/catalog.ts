import type { PermissionCatalog, PermissionCatalogEntry } from '../api/accessService';

/**
 * Presentation over the backend's permission vocabulary.
 *
 * The catalogue itself is served by the API (`GET /roles/catalog`) — this file
 * adds only what a browser is entitled to decide: what to call each resource,
 * which module it belongs under, and how the four access levels map onto the
 * actions. Nothing here invents a permission string; every grant this module
 * produces comes from the catalogue it was handed.
 */

/** What an admin picks per module. `custom` is a reading, never a choice. */
export type AccessLevel = 'none' | 'read' | 'write' | 'full';

export const ACCESS_LEVELS: { id: AccessLevel; label: string; hint: string }[] = [
  { id: 'none', label: 'None', hint: 'The module is hidden from this account.' },
  { id: 'read', label: 'Read', hint: 'Can open and read records. Changes nothing.' },
  { id: 'write', label: 'Write', hint: 'Can add and edit records, but not delete or approve.' },
  { id: 'full', label: 'Full', hint: 'Every action on the module, deletions and approvals included.' },
];

/** Actions a "Read" grant covers. */
const READ_ACTIONS = new Set(['view', 'download']);

/** Actions "Write" adds on top of Read. */
const WRITE_ACTIONS = new Set(['create', 'update', 'upload', 'request', 'calculate']);

/**
 * Grants that destroy data, move money, or expose a person's private record.
 *
 * Flagged so the review step can say what is actually being handed over
 * instead of only counting. Everything ending in `.delete` is included
 * implicitly; this list is the rest.
 */
const ELEVATED_GRANTS = new Set([
  'finance.approve',
  'payroll.approve',
  'payroll.pay',
  'hr.view-salary',
  'hr.view-identity',
  'documents.verify',
  'hr-documents.issue',
  'leave.approve',
  'settings.update',
  'roles.create',
  'roles.update',
  'roles.delete',
  'users.create',
  'users.update',
]);

export function isSensitive(permission: string): boolean {
  return permission.endsWith('.delete') || ELEVATED_GRANTS.has(permission);
}

/** Display groups, in the order the console shows them. */
const MODULE_GROUPS: { id: string; label: string; blurb: string; resources: string[] }[] = [
  {
    id: 'operations',
    label: 'Operations',
    blurb: 'The day-to-day container work.',
    resources: ['shipments', 'bookings', 'empty-returns', 'documents'],
  },
  {
    id: 'directory',
    label: 'Directory & Fleet',
    blurb: 'Who we work with and what moves the boxes.',
    resources: ['shippers', 'partners', 'vehicles', 'drivers'],
  },
  {
    id: 'finance',
    label: 'Finance',
    blurb: 'Money out to transporters, money in from shippers.',
    resources: ['finance', 'projects'],
  },
  {
    id: 'people',
    label: 'HR & Payroll',
    blurb: 'Staff records, salaries and leave.',
    resources: ['hr', 'payroll', 'hr-documents', 'leave'],
  },
  {
    id: 'system',
    label: 'System',
    blurb: 'The console itself — accounts, access and configuration.',
    resources: ['users', 'roles', 'settings', 'analytics'],
  },
];

const RESOURCE_LABELS: Record<string, string> = {
  shipments: 'Shipments',
  bookings: 'Bookings',
  'empty-returns': 'Empty Returns',
  documents: 'Documents',
  shippers: 'Shippers',
  partners: 'Transporters',
  vehicles: 'Vehicles',
  drivers: 'Drivers',
  finance: 'Finance',
  projects: 'Projects',
  hr: 'Employee Records',
  payroll: 'Payroll',
  'hr-documents': 'HR Documents',
  leave: 'Leave',
  users: 'Users',
  roles: 'Access Profiles',
  settings: 'Settings',
  analytics: 'Analytics',
};

const ACTION_LABELS: Record<string, string> = {
  view: 'View',
  create: 'Create',
  update: 'Edit',
  delete: 'Delete',
  upload: 'Upload',
  download: 'Download',
  verify: 'Verify',
  approve: 'Approve',
  calculate: 'Calculate',
  pay: 'Pay',
  issue: 'Issue',
  request: 'Request',
  'view-salary': 'See salaries',
  'view-identity': 'See ID documents',
};

export function resourceLabel(resource: string): string {
  return RESOURCE_LABELS[resource] ?? titleCase(resource);
}

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? titleCase(action);
}

/** `finance.approve` -> "Finance · Approve"; `finance.*` -> "Finance · Everything". */
export function permissionLabel(permission: string): string {
  if (permission === '*') return 'Everything';
  const dot = permission.indexOf('.');
  if (dot < 0) return permission;
  const action = permission.slice(dot + 1);
  return `${resourceLabel(permission.slice(0, dot))} · ${action === '*' ? 'Everything' : actionLabel(action)}`;
}

function titleCase(value: string): string {
  return value
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export interface ModuleGroup {
  id: string;
  label: string;
  blurb: string;
  entries: PermissionCatalogEntry[];
}

/**
 * Groups the served catalogue for display.
 *
 * A resource the backend adds but this file has not been told about still
 * appears, under "Other" — a new permission must never be invisible in the
 * screen that hands permissions out.
 */
export function groupCatalog(catalog: PermissionCatalog): ModuleGroup[] {
  const byResource = new Map(catalog.resources.map((entry) => [entry.resource, entry]));
  const placed = new Set<string>();

  const groups: ModuleGroup[] = MODULE_GROUPS.map((group) => {
    const entries = group.resources
      .map((resource) => {
        const entry = byResource.get(resource);
        if (entry) placed.add(resource);
        return entry;
      })
      .filter((entry): entry is PermissionCatalogEntry => Boolean(entry));
    return { id: group.id, label: group.label, blurb: group.blurb, entries };
  }).filter((group) => group.entries.length > 0);

  const orphans = catalog.resources.filter((entry) => !placed.has(entry.resource));
  if (orphans.length > 0) {
    groups.push({
      id: 'other',
      label: 'Other',
      blurb: 'Added to the platform since this screen was written.',
      entries: orphans,
    });
  }

  return groups;
}

/** The concrete permissions a level grants on one resource. */
export function permissionsForLevel(entry: PermissionCatalogEntry, level: AccessLevel): string[] {
  switch (level) {
    case 'none':
      return [];
    case 'read':
      return entry.permissions.filter((p) => READ_ACTIONS.has(action(entry, p)));
    case 'write':
      return entry.permissions.filter(
        (p) => READ_ACTIONS.has(action(entry, p)) || WRITE_ACTIONS.has(action(entry, p)),
      );
    case 'full':
      return [...entry.permissions];
  }
}

function action(entry: PermissionCatalogEntry, permission: string): string {
  return permission.slice(entry.resource.length + 1);
}

/**
 * Which level the current selection matches, or `null` when it matches none.
 *
 * Read before Write before Full, so a resource whose only action is `view`
 * (`analytics`) reads as Read rather than Full — "full access to analytics"
 * would overstate a grant that lets you look at a chart.
 */
export function levelOf(entry: PermissionCatalogEntry, selected: Set<string>): AccessLevel | null {
  const chosen = entry.permissions.filter((p) => selected.has(p));
  if (chosen.length === 0) return 'none';

  for (const level of ['read', 'write', 'full'] as const) {
    const expected = permissionsForLevel(entry, level);
    if (expected.length === chosen.length && expected.every((p) => selected.has(p))) {
      return level;
    }
  }
  return null;
}

/**
 * Collapses a selection to the shortest grant list that expresses it.
 *
 * A resource held in full becomes `resource.*` rather than four literals, so a
 * profile keeps meaning what the admin said it meant when the backend later
 * adds a fifth action to that resource.
 */
export function toGrants(catalog: PermissionCatalog, selected: Set<string>): string[] {
  return catalog.resources.flatMap((entry) => {
    const chosen = entry.permissions.filter((p) => selected.has(p));
    if (chosen.length === 0) return [];
    if (chosen.length === entry.permissions.length) return [entry.wildcard];
    return chosen;
  });
}

/** The inverse: stored grants (wildcards included) to a concrete selection. */
export function fromGrants(catalog: PermissionCatalog, grants: string[]): Set<string> {
  const selected = new Set<string>();
  const all = grants.includes('*');

  for (const entry of catalog.resources) {
    for (const permission of entry.permissions) {
      if (all || grants.includes(entry.wildcard) || grants.includes(permission)) {
        selected.add(permission);
      }
    }
  }
  return selected;
}

export interface AccessSummary {
  /** Concrete permissions granted. */
  count: number;
  /** Out of how many the platform defines. */
  total: number;
  /** Modules touched at all. */
  moduleCount: number;
  /** The sensitive grants inside the selection, labelled. */
  sensitive: string[];
}

export function summarize(catalog: PermissionCatalog, selected: Set<string>): AccessSummary {
  const granted = catalog.resources.flatMap((entry) =>
    entry.permissions.filter((p) => selected.has(p)),
  );

  return {
    count: granted.length,
    total: catalog.total,
    moduleCount: catalog.resources.filter((entry) =>
      entry.permissions.some((p) => selected.has(p)),
    ).length,
    sensitive: granted.filter(isSensitive),
  };
}
