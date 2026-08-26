import { useState } from 'react';

import { Checkbox } from '@/design-system';
import { AlertTriangle, ChevronDown, Lock } from '@/design-system/icons';
import {
  ACCESS_LEVELS,
  actionLabel,
  groupCatalog,
  isSensitive,
  levelOf,
  permissionsForLevel,
  resourceLabel,
  type AccessLevel,
  type PermissionCatalog,
  type PermissionCatalogEntry,
} from '@/features/access';
import { cn } from '@/utils';

/**
 * The custom-access picker.
 *
 * Two depths on purpose. The row is a four-step level — None / Read / Write /
 * Full — because that is the question an admin is actually answering, and a
 * grid of sixty-nine checkboxes is not a way to answer it. Opening a row
 * reveals the individual actions underneath, for the cases the four steps
 * cannot express: "can edit bookings but never delete one", or an HR profile
 * that reads records without seeing salaries.
 *
 * The levels are a shorthand over the same checkboxes, not a separate model:
 * ticking actions by hand simply lands the row on "Custom".
 */
export function PermissionMatrix({
  catalog,
  selected,
  onChange,
  readOnly = false,
}: {
  catalog: PermissionCatalog;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  readOnly?: boolean;
}) {
  const groups = groupCatalog(catalog);

  const setLevel = (entry: PermissionCatalogEntry, level: AccessLevel) => {
    const next = new Set(selected);
    entry.permissions.forEach((permission) => next.delete(permission));
    permissionsForLevel(entry, level).forEach((permission) => next.add(permission));
    onChange(next);
  };

  const toggle = (permission: string) => {
    const next = new Set(selected);
    if (next.has(permission)) next.delete(permission);
    else next.add(permission);
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.id} className="overflow-hidden rounded-card border border-border bg-card">
          <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-border/70 bg-muted/30 px-4 py-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wide text-foreground">{group.label}</h4>
            <p className="text-2xs text-muted-foreground">{group.blurb}</p>
          </header>

          <div className="divide-y divide-border/60">
            {group.entries.map((entry) => (
              <ResourceRow
                key={entry.resource}
                entry={entry}
                selected={selected}
                readOnly={readOnly}
                onSetLevel={(level) => setLevel(entry, level)}
                onToggle={toggle}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * The levels worth offering for one resource.
 *
 * Not every resource has four meaningful steps. `analytics` defines only
 * `view`, so Write and Full would grant exactly what Read does; `settings` has
 * no destructive action, so Full equals Write. Offering a button that changes
 * nothing — and that `levelOf` can never highlight, since it resolves to the
 * lowest matching level — reads as a broken control. Duplicates are dropped,
 * keeping the lowest name for the set.
 */
function offeredLevels(entry: PermissionCatalogEntry) {
  const seen = new Set<string>();
  return ACCESS_LEVELS.filter((option) => {
    const key = permissionsForLevel(entry, option.id).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ResourceRow({
  entry,
  selected,
  readOnly,
  onSetLevel,
  onToggle,
}: {
  entry: PermissionCatalogEntry;
  selected: Set<string>;
  readOnly: boolean;
  onSetLevel: (level: AccessLevel) => void;
  onToggle: (permission: string) => void;
}) {
  const level = levelOf(entry, selected);
  const granted = entry.permissions.filter((p) => selected.has(p));
  /* A hand-picked mix has no level to highlight, so the row opens itself —
     otherwise the only thing on screen would be four unlit buttons. */
  const [open, setOpen] = useState(level === null);

  return (
    <div className={cn('px-4 py-3', granted.length > 0 && 'bg-primary/[0.03]')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="group flex min-w-0 items-center gap-2 text-left"
        >
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
          <span className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
            {resourceLabel(entry.resource)}
          </span>
          <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
            {granted.length}/{entry.permissions.length}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-background p-0.5">
          {offeredLevels(entry).map((option) => {
            const active = level === option.id;
            return (
              <button
                key={option.id}
                type="button"
                disabled={readOnly}
                title={option.hint}
                aria-pressed={active}
                aria-label={`${option.label} access to ${resourceLabel(entry.resource)}`}
                onClick={() => onSetLevel(option.id)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-2xs font-semibold transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  readOnly && 'cursor-default opacity-70 hover:bg-transparent',
                )}
              >
                {option.label}
              </button>
            );
          })}
          {level === null && (
            <span className="rounded-full bg-warning-subtle px-2.5 py-1 text-2xs font-semibold text-warning-subtle-foreground">
              Custom
            </span>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 border-t border-border/50 pt-3 pl-5 sm:grid-cols-2 lg:grid-cols-3">
          {entry.permissions.map((permission) => {
            const action = permission.slice(entry.resource.length + 1);
            const sensitive = isSensitive(permission);
            return (
              <label
                key={permission}
                className={cn(
                  'flex items-start gap-2',
                  readOnly ? 'cursor-default' : 'cursor-pointer',
                )}
              >
                <Checkbox
                  checkboxSize="sm"
                  className="mt-0.5"
                  checked={selected.has(permission)}
                  disabled={readOnly}
                  onChange={() => onToggle(permission)}
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    {actionLabel(action)}
                    {sensitive && (
                      <AlertTriangle className="h-3 w-3 shrink-0 text-warning" aria-label="Sensitive" />
                    )}
                  </span>
                  <span className="block truncate font-mono text-[10px] text-muted-foreground">
                    {permission}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Read-only rendering of a built-in profile's grants. */
export function PermissionMatrixLocked({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        Built-in profile. The app depends on it by name, so its grants are fixed — copy it to make an
        editable version.
      </p>
      {children}
    </div>
  );
}
