import { X } from '@/design-system/icons';

import { Button, IconButton } from '@/design-system/primitives/Button';
import { cn } from '@/utils';

import type { BulkAction } from './types';

/**
 * BulkActionBar — appears automatically once one or more rows are selected.
 *
 * Renders nothing when the selection is empty, so `EnterpriseDataTable` can
 * mount it unconditionally above the table body. Actions are supplied by the
 * consuming module (delete, export, archive, assign, …) — the framework only
 * owns the chrome and the selection counter.
 */

export interface BulkActionBarProps<TData> {
  selectedRows: TData[];
  actions: BulkAction<TData>[];
  onClearSelection: () => void;
  className?: string;
}

export function BulkActionBar<TData>({ selectedRows, actions, onClearSelection, className }: BulkActionBarProps<TData>) {
  const count = selectedRows.length;
  if (count === 0) return null;

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-card border border-primary/30 bg-primary-subtle px-4 py-2.5',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <IconButton aria-label="Clear selection" variant="ghost" size="sm" onClick={onClearSelection}>
          <X />
        </IconButton>
        <span className="type-body-sm font-medium text-primary-subtle-foreground">
          {count} {count === 1 ? 'row' : 'rows'} selected
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {actions.map((action) => (
          <Button
            key={action.id}
            variant={action.variant === 'destructive' ? 'destructive' : 'outline'}
            size="sm"
            leadingIcon={action.icon}
            disabled={action.isDisabled?.(selectedRows)}
            onClick={() => action.onSelect(selectedRows)}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
