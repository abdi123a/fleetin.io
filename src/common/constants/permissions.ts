/**
 * The authorization vocabulary. The backend is the source of truth for what a
 * permission *is*; roles only reference these strings.
 *
 * ## Convention
 *
 * `resource.action` — lowercase, dot-separated, singular action verb.
 * Resources are plural nouns (`partners`, not `partner`). Nothing else is a
 * valid permission: `PermissionsGuard` compares against these literals.
 *
 * ## Wildcards
 *
 * Two forms are understood when a *role* is granted a permission (never when
 * an endpoint requires one):
 *
 *   `*`            — superuser; satisfies every check.
 *   `partners.*`   — every action on that one resource.
 *
 * An endpoint always requires a concrete permission, so the required set is
 * unambiguous and greppable.
 *
 * ## Scope of this file
 *
 * Only resources that exist today (`users`, `roles`) plus the vocabulary the
 * domain is known to need are listed. This is deliberately *just* the naming
 * — no controllers, services or models exist for the business resources yet.
 * They are declared here so authorization has one place to grow from rather
 * than accumulating ad-hoc strings across controllers later.
 */

export const PERMISSIONS = {
  users: {
    view: 'users.view',
    create: 'users.create',
    update: 'users.update',
    delete: 'users.delete',
  },
  roles: {
    view: 'roles.view',
    create: 'roles.create',
    update: 'roles.update',
    delete: 'roles.delete',
  },
  shippers: {
    view: 'shippers.view',
    create: 'shippers.create',
    update: 'shippers.update',
    delete: 'shippers.delete',
  },
  partners: {
    view: 'partners.view',
    create: 'partners.create',
    update: 'partners.update',
    delete: 'partners.delete',
  },
  vehicles: {
    view: 'vehicles.view',
    create: 'vehicles.create',
    update: 'vehicles.update',
    delete: 'vehicles.delete',
  },
  drivers: {
    view: 'drivers.view',
    create: 'drivers.create',
    update: 'drivers.update',
    delete: 'drivers.delete',
  },
  documents: {
    view: 'documents.view',
    upload: 'documents.upload',
    verify: 'documents.verify',
    delete: 'documents.delete',
  },
  shipments: {
    view: 'shipments.view',
    create: 'shipments.create',
    update: 'shipments.update',
    delete: 'shipments.delete',
  },
  bookings: {
    view: 'bookings.view',
    create: 'bookings.create',
    update: 'bookings.update',
    delete: 'bookings.delete',
  },
  emptyReturns: {
    view: 'empty-returns.view',
    create: 'empty-returns.create',
    update: 'empty-returns.update',
    delete: 'empty-returns.delete',
  },
  finance: {
    view: 'finance.view',
    create: 'finance.create',
    update: 'finance.update',
    approve: 'finance.approve',
  },
  projects: {
    view: 'projects.view',
    create: 'projects.create',
    update: 'projects.update',
    delete: 'projects.delete',
  },
  analytics: {
    view: 'analytics.view',
  },
  settings: {
    view: 'settings.view',
    update: 'settings.update',
  },
  /*
   * HR & Payroll.
   *
   * `hr.salary.view` and `hr.identity.view` are data gates rather than
   * resource actions, because §6 of the HR spec draws its lines *through* a
   * record rather than around it: a MANAGER sees their team's employee
   * records but not their salaries, and FINANCE sees every payroll figure but
   * no ID scans. A single `hr.view` cannot express that without making one of
   * those two roles wrong.
   *
   * They keep the single-dot `resource.action` shape the rest of the
   * catalogue uses, so `hr.*` grants them and the guard compares them like
   * any other literal.
   */
  hr: {
    view: 'hr.view',
    create: 'hr.create',
    update: 'hr.update',
    delete: 'hr.delete',
    /** Gate on base salary, payroll figures and bank details. */
    viewSalary: 'hr.view-salary',
    /** Gate on ID/passport/CV scans and the encrypted identity fields. */
    viewIdentity: 'hr.view-identity',
  },
  payroll: {
    view: 'payroll.view',
    calculate: 'payroll.calculate',
    approve: 'payroll.approve',
    pay: 'payroll.pay',
  },
  hrDocuments: {
    view: 'hr-documents.view',
    upload: 'hr-documents.upload',
    download: 'hr-documents.download',
    issue: 'hr-documents.issue',
    delete: 'hr-documents.delete',
  },
  leave: {
    view: 'leave.view',
    request: 'leave.request',
    approve: 'leave.approve',
  },
  /*
   * Workspace — the internal work layer.
   *
   * Four grants, not one per sub-object. Tasks, comments, mentions and the
   * inbox are one feature: an account that can open Workspace can read all of
   * it, because a board with rows missing is worse than no board. What the
   * grants separate is *doing* rather than *seeing* — `create` raises work,
   * `assign` hands it to somebody else, `manage` edits or cancels work you
   * did not raise.
   *
   * Deliberately NOT scoped per record type. A task naming an invoice is
   * visible to anyone with `workspace.view`; the invoice BEHIND the link is
   * still gated on `finance.view` when it renders. Work is shared, data is
   * not.
   *
   * Note for whoever adds the next one: `Role.permissions` is a JSON column,
   * so a new string here reaches nobody until a data migration writes it into
   * the existing role rows. See `..._workspace_permissions`.
   */
  /*
   * The location catalogue — ports, free zones, depots, yards.
   *
   * Read is split from write for the reason every directory splits them: a
   * dispatcher picking a drop-off needs to SEE every place, and a place added
   * carelessly is a place that quietly mis-measures every distance computed
   * from it afterwards. `create` covers searching Google and saving the
   * result, because those are one action from the operator's side.
   *
   * Note for whoever adds the next one: `Role.permissions` is a JSON column,
   * so a new string here reaches nobody until a data migration writes it into
   * the existing role rows. See `..._locations_permissions`.
   */
  locations: {
    view: 'locations.view',
    create: 'locations.create',
    update: 'locations.update',
    delete: 'locations.delete',
  },
  workspace: {
    view: 'workspace.view',
    create: 'workspace.create',
    assign: 'workspace.assign',
    /** Edit or cancel work somebody else raised. */
    manage: 'workspace.manage',
  },
} as const;

/** Grants every permission. Reserved for the ADMIN role. */
export const WILDCARD_ALL = '*';

/** Flat list of every concrete permission, for validation and seeding. */
export const ALL_PERMISSIONS: string[] = Object.values(PERMISSIONS).flatMap(
  (resource) => Object.values(resource),
);

/** Every known resource prefix, e.g. `partners`, `empty-returns`. */
export const ALL_RESOURCES: string[] = [
  ...new Set(ALL_PERMISSIONS.map((permission) => permission.split('.')[0])),
];

/**
 * Does a granted permission satisfy a required one?
 *
 * Handles the global wildcard, the per-resource wildcard, and exact equality.
 * Kept here rather than in the guard so the seed, tests and any future admin
 * UI all resolve permissions identically.
 */
export function grantSatisfies(granted: string, required: string): boolean {
  if (granted === WILDCARD_ALL) return true;
  if (granted === required) return true;

  if (granted.endsWith('.*')) {
    const resource = granted.slice(0, -2);
    return required.startsWith(`${resource}.`);
  }

  return false;
}

/** Does any of a role's grants satisfy the required permission? */
export function hasPermission(granted: string[], required: string): boolean {
  return granted.some((grant) => grantSatisfies(grant, required));
}

/**
 * One resource and everything that can be done to it.
 *
 * Served to the admin UI (`GET /roles/catalog`) so the permission picker is
 * generated from this file rather than from a second list maintained in the
 * frontend. A permission added here shows up in the picker on the next reload;
 * one that is renamed cannot be silently granted by a stale checkbox.
 */
export interface PermissionCatalogEntry {
  /** e.g. `empty-returns`. */
  resource: string;
  /** Action halves only, e.g. `view`, `view-salary`. */
  actions: string[];
  /** Fully-qualified grants, e.g. `empty-returns.view`. */
  permissions: string[];
  /** The `resource.*` grant that covers every action above. */
  wildcard: string;
}

/** Every resource with its actions, in catalogue order. */
export const PERMISSION_CATALOG: PermissionCatalogEntry[] = ALL_RESOURCES.map((resource) => {
  const permissions = ALL_PERMISSIONS.filter((p) => p.startsWith(`${resource}.`));
  return {
    resource,
    actions: permissions.map((p) => p.slice(resource.length + 1)),
    permissions,
    wildcard: `${resource}.*`,
  };
});

/**
 * Expands a role's grants into the concrete permissions they actually confer.
 *
 * Wildcards are what make "how much access does this account have?"
 * unanswerable by counting the stored array: `['*']` is one entry and total
 * control. The admin UI states a real number, so the expansion that produces
 * it lives here next to `grantSatisfies` rather than being reimplemented in a
 * browser.
 */
export function expandGrants(granted: string[]): string[] {
  return ALL_PERMISSIONS.filter((permission) => hasPermission(granted, permission));
}

/** True when the string is a permission this system recognises. */
export function isKnownPermission(value: string): boolean {
  if (value === WILDCARD_ALL) return true;
  if (value.endsWith('.*')) {
    return ALL_RESOURCES.includes(value.slice(0, -2));
  }
  return ALL_PERMISSIONS.includes(value);
}
