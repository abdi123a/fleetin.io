import {
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type ExpandedState,
  type OnChangeFn,
  type PaginationState,
  type Row,
  type RowSelectionState,
  type SortingState,
  type Table,
  type Updater,
  type VisibilityState,
} from '@tanstack/react-table';
import { useCallback, useState } from 'react';

import type { DataTableMode } from './types';

const DEFAULT_PAGE_SIZE = 10;

/* ---------------------------------------------------------------------------
 * Controllable state
 * ---------------------------------------------------------------------------
 * The same controlled/uncontrolled pattern `Input` and `DatePicker` use: a
 * prop value wins when supplied, otherwise the hook owns the state. Every
 * piece of TanStack table state (sorting, filters, selection, pagination…)
 * gets this for free, so `EnterpriseDataTable` works standalone and a module
 * can lift any single piece of state into a query without touching the rest.
 * ------------------------------------------------------------------------- */

function resolveUpdater<T>(updater: Updater<T>, previous: T): T {
  return typeof updater === 'function' ? (updater as (old: T) => T)(previous) : updater;
}

function useControllableTableState<T>(
  controlled: T | undefined,
  onChange: OnChangeFn<T> | undefined,
  initial: T,
): [T, OnChangeFn<T>] {
  const [internal, setInternal] = useState<T>(initial);
  const value = controlled ?? internal;

  const setValue = useCallback<OnChangeFn<T>>(
    (updater) => {
      const next = resolveUpdater(updater, value);
      setInternal(next);
      onChange?.(updater);
    },
    [value, onChange],
  );

  return [value, setValue];
}

/* ---------------------------------------------------------------------------
 * useEnterpriseTable
 * ------------------------------------------------------------------------- */

export interface UseEnterpriseTableOptions<TData> {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  /** `client` runs sorting/filtering/pagination in the browser; `server` treats `data` as the current page only. Default 'client'. */
  mode?: DataTableMode;
  getRowId?: (row: TData, index: number) => string;

  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  enableSorting?: boolean;
  enableMultiSort?: boolean;

  globalFilter?: string;
  onGlobalFilterChange?: OnChangeFn<string>;
  enableGlobalFilter?: boolean;

  columnFilters?: ColumnFiltersState;
  onColumnFiltersChange?: OnChangeFn<ColumnFiltersState>;
  enableColumnFilters?: boolean;

  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: OnChangeFn<VisibilityState>;

  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  enableRowSelection?: boolean | ((row: Row<TData>) => boolean);

  /** Enables the pagination row model. Default true. Set false for a fully scrollable, unpaginated table. */
  enablePagination?: boolean;
  pagination?: PaginationState;
  onPaginationChange?: OnChangeFn<PaginationState>;
  /**
   * `auto` (default for `mode: 'client'`) paginates the in-memory rows.
   * `manual` (default for `mode: 'server'`) trusts `pageCount`/`rowCount` and
   * expects the caller to already have fetched only the current page.
   */
  paginationMode?: 'auto' | 'manual';
  pageCount?: number;
  rowCount?: number;
  defaultPageSize?: number;

  expanded?: ExpandedState;
  onExpandedChange?: OnChangeFn<ExpandedState>;
  getRowCanExpand?: (row: Row<TData>) => boolean;
}

export interface UseEnterpriseTableResult<TData> {
  table: Table<TData>;
  selectedRows: TData[];
  selectedCount: number;
  totalRowCount: number;
  resetSelection: () => void;
}

export function useEnterpriseTable<TData>(
  options: UseEnterpriseTableOptions<TData>,
): UseEnterpriseTableResult<TData> {
  const {
    data,
    columns,
    mode = 'client',
    getRowId,

    sorting: sortingProp,
    onSortingChange,
    enableSorting = true,
    enableMultiSort = true,

    globalFilter: globalFilterProp,
    onGlobalFilterChange,
    enableGlobalFilter = true,

    columnFilters: columnFiltersProp,
    onColumnFiltersChange,
    enableColumnFilters = true,

    columnVisibility: columnVisibilityProp,
    onColumnVisibilityChange,

    rowSelection: rowSelectionProp,
    onRowSelectionChange,
    enableRowSelection = false,

    enablePagination = true,
    pagination: paginationProp,
    onPaginationChange,
    paginationMode,
    pageCount,
    rowCount,
    defaultPageSize = DEFAULT_PAGE_SIZE,

    expanded: expandedProp,
    onExpandedChange,
    getRowCanExpand,
  } = options;

  const [sorting, setSorting] = useControllableTableState<SortingState>(sortingProp, onSortingChange, []);
  const [globalFilter, setGlobalFilter] = useControllableTableState<string>(
    globalFilterProp,
    onGlobalFilterChange,
    '',
  );
  const [columnFilters, setColumnFilters] = useControllableTableState<ColumnFiltersState>(
    columnFiltersProp,
    onColumnFiltersChange,
    [],
  );
  const [columnVisibility, setColumnVisibility] = useControllableTableState<VisibilityState>(
    columnVisibilityProp,
    onColumnVisibilityChange,
    {},
  );
  const [rowSelection, setRowSelection] = useControllableTableState<RowSelectionState>(
    rowSelectionProp,
    onRowSelectionChange,
    {},
  );
  const [pagination, setPagination] = useControllableTableState<PaginationState>(
    paginationProp,
    onPaginationChange,
    { pageIndex: 0, pageSize: defaultPageSize },
  );
  const [expanded, setExpanded] = useControllableTableState<ExpandedState>(expandedProp, onExpandedChange, {});

  const isServer = mode === 'server';
  const manualPagination = paginationMode ? paginationMode === 'manual' : isServer;

  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: {
      sorting,
      globalFilter,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination,
      expanded,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    onExpandedChange: setExpanded,

    enableSorting,
    enableMultiSort,
    enableGlobalFilter,
    enableColumnFilters,
    enableRowSelection,
    getRowCanExpand,

    manualSorting: isServer,
    manualFiltering: isServer,
    manualPagination,
    pageCount: manualPagination ? (pageCount ?? -1) : undefined,
    rowCount: manualPagination ? rowCount : undefined,

    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: isServer ? undefined : getSortedRowModel(),
    getFilteredRowModel: isServer ? undefined : getFilteredRowModel(),
    getPaginationRowModel: enablePagination ? getPaginationRowModel() : undefined,
    getExpandedRowModel: getExpandedRowModel(),
  });

  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original);
  const totalRowCount = isServer ? (rowCount ?? data.length) : table.getFilteredRowModel().rows.length;

  const resetSelection = useCallback(() => table.resetRowSelection(), [table]);

  return {
    table,
    selectedRows,
    selectedCount: selectedRows.length,
    totalRowCount,
    resetSelection,
  };
}
