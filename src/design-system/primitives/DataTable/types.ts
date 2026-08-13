import type { ReactNode } from 'react';
import type { Column, RowData } from '@tanstack/table-core';

/**
 * Enterprise Data Framework — shared types.
 *
 * Every module (Partners, Vehicles, Drivers, Employees, Documents, Finance,
 * Inventory, Reports, Administration) consumes these through
 * `EnterpriseDataTable<T>` — none of them redeclare table state shapes.
 */

/* ---------------------------------------------------------------------------
 * Column metadata
 * ---------------------------------------------------------------------------
 * Module augmentation on TanStack's `ColumnMeta` so column definitions can
 * carry presentation intent (alignment, sticky edge, export inclusion,
 * column-manager label) without a parallel config object.
 * ------------------------------------------------------------------------- */

declare module '@tanstack/table-core' {
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Label shown in the Column Manager and export sheet. Falls back to the column header when omitted. */
    label?: string;
    /** Text alignment for header + cells. Default 'left'. */
    align?: 'left' | 'center' | 'right';
    /** Fixed pixel width hint used for sticky offset calculations. */
    width?: number;
    /** Excludes the column from CSV/export output. Default false (included). */
    excludeFromExport?: boolean;
    /** Hides the column from the Column Manager (it can still be hidden via `columnVisibility`, just not toggled there). */
    hideFromColumnManager?: boolean;
    /** Extra class names merged onto every cell in the column. */
    cellClassName?: string;
    /** Extra class names merged onto the header cell. */
    headerClassName?: string;

    /* --- Card layout (`layout="cards"`) ------------------------------------
     * The same column definitions drive both layouts. These decide which
     * panel of the row card a column renders into, and how.
     * -------------------------------------------------------------------- */

    /**
     * Which panel of a row card this column renders in.
     *   'lead'     — the left identity panel (sunken, bordered)
     *   'field'    — the centre icon + value/label grid (default)
     *   'trailing' — the right status/actions panel
     *   'hidden'   — rendered in the table layout only
     */
    cardSlot?: CardSlot;
    /** Icon rendered in the field's tinted box. Card layout only. */
    icon?: ReactNode;
    /** Tint of that icon box. Card layout only. Default 'teal'. */
    iconTheme?: CardFieldTheme;
    /**
     * Renders the cell as the field's small muted sub-label instead of a
     * field of its own — the "300 Metric Ton (t)s" under "Edible Oils".
     * Points at the column id this column is a sub-label for.
     */
    cardSubLabelOf?: string;
  }
}

export type CardSlot = 'lead' | 'field' | 'trailing' | 'hidden';

/** Icon-box tints available to a card field — mirrors `CardDataField`'s themes. */
export type CardFieldTheme = 'teal' | 'blue' | 'emerald' | 'amber' | 'slate' | 'avatar' | 'none';

/** A corner tag flush in a row card's top-left corner (Shipment# / Booking# …). */
export interface CardBadge {
  label: string;
  intent?: 'teal' | 'orange' | 'green' | 'blue' | 'neutral';
}

export type DataTableLayout = 'table' | 'cards';

/* ---------------------------------------------------------------------------
 * Density
 * ------------------------------------------------------------------------- */

export type TableDensity = 'compact' | 'comfortable' | 'spacious';

export const DENSITY_OPTIONS: { value: TableDensity; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'spacious', label: 'Spacious' },
];

export const DEFAULT_DENSITY: TableDensity = 'comfortable';

/** Vertical cell padding per density step, shared by the table body and its skeletons so loading state never jumps on load. */
export const DENSITY_CELL_PADDING: Record<TableDensity, string> = {
  compact: 'py-1.5',
  comfortable: 'py-2.5',
  spacious: 'py-4',
};

/* ---------------------------------------------------------------------------
 * Data source mode
 * ------------------------------------------------------------------------- */

/**
 * `client` — the full dataset is in memory; sorting, filtering and pagination
 * run in the browser via TanStack's row models.
 *
 * `server` — `data` is just the current page; sorting, filtering and
 * pagination state changes are meant to be read by the caller and turned
 * into a query (see the Server-side Integration Guide on `/design-system`).
 */
export type DataTableMode = 'client' | 'server';

/* ---------------------------------------------------------------------------
 * Row / bulk actions
 * ------------------------------------------------------------------------- */

export interface RowAction<TData> {
  id: string;
  label: string;
  icon?: ReactNode;
  variant?: 'default' | 'destructive';
  isHidden?: (row: TData) => boolean;
  isDisabled?: (row: TData) => boolean;
  onSelect: (row: TData) => void;
}

export interface BulkAction<TData> {
  id: string;
  label: string;
  icon?: ReactNode;
  variant?: 'default' | 'destructive';
  isDisabled?: (selectedRows: TData[]) => boolean;
  onSelect: (selectedRows: TData[]) => void;
}

/* ---------------------------------------------------------------------------
 * Filters (FilterBar)
 * ------------------------------------------------------------------------- */

export type FilterFieldType =
  | 'text'
  | 'search'
  | 'select'
  | 'multiSelect'
  | 'checkbox'
  | 'boolean'
  | 'date'
  | 'dateRange'
  | 'status'
  | 'tags'
  | 'numberRange';

export interface FilterOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

export interface FilterFieldConfig {
  /** Matches a column id when the filter should drive that column's filter fn, or any custom key for server-side filtering. */
  id: string;
  label: string;
  type: FilterFieldType;
  /** Options for select / multiSelect / status / tags. */
  options?: FilterOption[];
  placeholder?: string;
  /** Shown in a tooltip next to the field label. */
  description?: string;
}

export type NumberRangeValue = [number | null, number | null];
export type DateRangeValue = [string | null, string | null];

export type FilterValue =
  | string
  | string[]
  | boolean
  | NumberRangeValue
  | DateRangeValue
  | null
  | undefined;

export type FilterState = Record<string, FilterValue>;

/** Whether a single filter value counts as "active" for badges / chips / clear-all. */
export function isFilterValueActive(value: FilterValue): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.length > 0;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    if (value.length === 0) return false;
    return value.some((entry) => entry !== null && entry !== undefined && entry !== '');
  }
  return false;
}

export function countActiveFilters(state: FilterState): number {
  return Object.values(state).filter(isFilterValueActive).length;
}

/* ---------------------------------------------------------------------------
 * Saved views
 * ------------------------------------------------------------------------- */

export interface SavedView {
  id: string;
  label: string;
  description?: string;
}

/* ---------------------------------------------------------------------------
 * Empty / error state configuration
 * ------------------------------------------------------------------------- */

export type DataTableStateKind =
  | 'loading'
  | 'no-data'
  | 'no-results'
  | 'error'
  | 'permission-denied'
  | 'offline';

export interface DataTableStateContent {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
}

/* ---------------------------------------------------------------------------
 * Export
 * ------------------------------------------------------------------------- */

export interface ExportFormat {
  id: string;
  label: string;
  icon?: ReactNode;
  onExport: () => void;
}

/* ---------------------------------------------------------------------------
 * Synthetic columns
 * ---------------------------------------------------------------------------
 * Ids `EnterpriseDataTable` reserves for the columns it injects (selection
 * checkbox, expand toggle, row actions). Used to exclude them from the Column
 * Manager and from the responsive card layout's label/value list.
 * ------------------------------------------------------------------------- */

export const SELECT_COLUMN_ID = '__select__';
export const EXPAND_COLUMN_ID = '__expand__';
export const ACTIONS_COLUMN_ID = '__actions__';

export const SYNTHETIC_COLUMN_IDS: ReadonlySet<string> = new Set([
  SELECT_COLUMN_ID,
  EXPAND_COLUMN_ID,
  ACTIONS_COLUMN_ID,
]);

/** Resolves the human label for a column: explicit `meta.label`, then a string header, then the id. */
export function resolveColumnLabel<TData>(column: Column<TData, unknown>): string {
  const meta = column.columnDef.meta;
  if (meta?.label) return meta.label;
  const header = column.columnDef.header;
  if (typeof header === 'string') return header;
  return column.id;
}
