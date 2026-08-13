import { Columns3 } from '@/design-system/icons';

import type { Table } from '@tanstack/react-table';

import { Button } from '@/design-system/primitives/Button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';

import { resolveColumnLabel } from './types';

/**
 * ColumnManager — show/hide columns and reset the layout.
 *
 * Drives `column.getIsVisible()` / `toggleVisibility()` on a live TanStack
 * `Table` instance, so it never drifts from what `EnterpriseDataTable` is
 * actually rendering. Column order is intentionally fixed for now — the
 * extension point for drag-and-drop reordering is `table.setColumnOrder()`,
 * already wired through `useEnterpriseTable`'s column-visibility state
 * plumbing; only the drag UI is future work.
 */

export interface ColumnManagerProps<TData> {
  table: Table<TData>;
  /** Trigger button label. Default 'Columns'. */
  label?: string;
  align?: 'start' | 'center' | 'end';
}

export function ColumnManager<TData>({ table, label = 'Columns', align = 'end' }: ColumnManagerProps<TData>) {
  const columns = table
    .getAllLeafColumns()
    .filter((column) => column.getCanHide() && !column.columnDef.meta?.hideFromColumnManager);

  if (columns.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" leadingIcon={<Columns3 />}>
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="max-h-80 overflow-y-auto">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={column.getIsVisible()}
            onCheckedChange={(checked) => column.toggleVisibility(checked)}
            onSelect={(event) => event.preventDefault()}
          >
            {resolveColumnLabel(column)}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => table.resetColumnVisibility()}>Reset layout</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
