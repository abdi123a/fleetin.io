import { ArrowDown, ArrowUp, ChevronRight, ChevronsUpDown } from '@/design-system/icons';

import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { flexRender, type ColumnDef, type Row } from '@tanstack/react-table';

import { Button, IconButton } from '@/design-system/primitives/Button';
import { Card } from '@/design-system/primitives/Layout';
import { Checkbox } from '@/design-system/primitives/SelectionControls';
import { useBreakpoint } from '@/hooks';
import { cn } from '@/utils';

import { BulkActionBar } from './BulkActionBar';
import { ActionsCell } from './cells';
import { DataPagination } from './DataPagination';
import { DataRowCard } from './DataRowCard';
import { DataToolbar, type DataToolbarProps } from './DataToolbar';
import { DataTableEmptyState, type DataTableEmptyStateProps } from './DataTableStates';
import { TableSkeleton } from './DataTableSkeletons';
import { FilterBar } from './FilterBar';
import { isQuickFilterField, QuickFilters } from './QuickFilters';
import {
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from './Table';
import {
  ACTIONS_COLUMN_ID,
  countActiveFilters,
  DEFAULT_DENSITY,
  DENSITY_CELL_PADDING,
  EXPAND_COLUMN_ID,
  isFilterValueActive,
  resolveColumnLabel,
  SELECT_COLUMN_ID,
  SYNTHETIC_COLUMN_IDS,
  type BulkAction,
  type CardBadge,
  type DataTableLayout,
  type ExportFormat,
  type FilterFieldConfig,
  type FilterState,
  type RowAction,
  type SavedView,
  type TableDensity,
} from './types';
import { useEnterpriseTable, type UseEnterpriseTableOptions } from './useEnterpriseTable';

/**
 * EnterpriseDataTable<T> — the standard table for the entire application.
 *
 * Composes `useEnterpriseTable` (TanStack Table state) with the rest of the
 * framework — toolbar, filter bar, bulk action bar, pagination, column
 * manager, empty/loading/error states — into one component every list page
 * renders. See `/design-system` § Enterprise Data Framework for the full
 * guide and consumption examples.
 */

export interface EnterpriseDataTableProps<TData> extends UseEnterpriseTableOptions<TData> {
  /**
   * `table` renders a dense grid. `cards` renders the FLEETIN list-page row
   * card — the same columns, laid out per `meta.cardSlot`. Default 'table'.
   */
  layout?: DataTableLayout;
  /** Corner tags for a row card (Shipment#, Booking#…). `layout="cards"` only. */
  cardBadges?: (row: TData) => CardBadge[];

  /** Row density. Controlled if `onDensityChange` is supplied. */
  density?: TableDensity;
  onDensityChange?: (density: TableDensity) => void;

  stickyHeader?: boolean;
  /** Max height of the scroll container while `stickyHeader` is set. Default '32rem'. */
  maxBodyHeight?: string | number;
  stickyFirstColumn?: boolean;
  /** Switches to a stacked-card layout below the `md` breakpoint. Default false. */
  responsive?: boolean;
  renderMobileCard?: (row: Row<TData>) => ReactNode;

  isLoading?: boolean;
  isError?: boolean;
  isOffline?: boolean;
  /** Set false to render the permission-denied state instead of the table. */
  hasPermission?: boolean;
  onRetry?: () => void;
  emptyState?: Partial<DataTableEmptyStateProps>;
  noResultsState?: Partial<DataTableEmptyStateProps>;
  errorState?: Partial<DataTableEmptyStateProps>;

  /** Hides the built-in toolbar entirely. */
  toolbar?: false;
  toolbarProps?: Omit<DataToolbarProps<TData>, 'table' | 'density' | 'onDensityChange'>;
  searchPlaceholder?: string;

  /** Advanced filter field definitions — renders the Filters toggle in the toolbar and the `FilterBar` panel. */
  filters?: FilterFieldConfig[];
  filterState?: FilterState;
  onFilterStateChange?: (state: FilterState) => void;
  onFiltersReset?: () => void;
  filtersDefaultOpen?: boolean;
  /**
   * Renders the pill filter row ("Filters · Date ▾ · All Filters · Reset")
   * above the results instead of a Filters button inside the toolbar.
   * Default true when `layout="cards"`.
   */
  quickFilters?: boolean;
  /** Right-aligned slot on the quick-filter row — the "Assigned to me" style switches. */
  quickFilterToggles?: ReactNode;

  bulkActions?: BulkAction<TData>[];
  rowActions?: RowAction<TData>[] | ((row: TData) => RowAction<TData>[]);
  onRowClick?: (row: TData) => void;

  renderSubRow?: (row: Row<TData>) => ReactNode;

  onRefresh?: () => void;
  isRefreshing?: boolean;
  onExport?: () => void;
  exportFormats?: ExportFormat[];

  savedViews?: SavedView[];
  activeSavedView?: string;
  onSavedViewChange?: (id: string) => void;

  createAction?: ReactNode;
  toolbarActions?: ReactNode;

  /** Accessible table name, rendered as a visually-hidden `<caption>`. */
  caption?: string;
  className?: string;
  tableClassName?: string;
}

function SortIcon({ direction }: { direction: false | 'asc' | 'desc' }) {
  if (direction === 'asc') return <ArrowUp className="h-3.5 w-3.5" />;
  if (direction === 'desc') return <ArrowDown className="h-3.5 w-3.5" />;
  return <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/60" />;
}

function ExpandToggle<TData>({ row }: { row: Row<TData> }) {
  if (!row.getCanExpand()) return null;
  return (
    <IconButton
      aria-label={row.getIsExpanded() ? 'Collapse row' : 'Expand row'}
      variant="ghost"
      size="sm"
      onClick={row.getToggleExpandedHandler()}
    >
      <ChevronRight className={cn('transition-transform', row.getIsExpanded() && 'rotate-90')} />
    </IconButton>
  );
}

export function EnterpriseDataTable<TData>({
  // useEnterpriseTable passthrough
  data,
  columns,
  mode,
  getRowId,
  sorting,
  onSortingChange,
  enableSorting,
  enableMultiSort,
  globalFilter,
  onGlobalFilterChange,
  enableGlobalFilter,
  columnFilters,
  onColumnFiltersChange,
  enableColumnFilters,
  columnVisibility,
  onColumnVisibilityChange,
  rowSelection,
  onRowSelectionChange,
  enableRowSelection = false,
  enablePagination = true,
  pagination,
  onPaginationChange,
  paginationMode,
  pageCount,
  rowCount,
  defaultPageSize,
  expanded,
  onExpandedChange,
  getRowCanExpand,

  // presentation
  layout = 'table',
  cardBadges,
  density,
  onDensityChange,
  stickyHeader = false,
  maxBodyHeight = '32rem',
  stickyFirstColumn = false,
  responsive = false,
  renderMobileCard,

  isLoading = false,
  isError = false,
  isOffline = false,
  hasPermission,
  onRetry,
  emptyState,
  noResultsState,
  errorState,

  toolbar,
  toolbarProps,
  searchPlaceholder,

  filters,
  filterState,
  onFilterStateChange,
  onFiltersReset,
  filtersDefaultOpen = false,
  quickFilters,
  quickFilterToggles,

  bulkActions,
  rowActions,
  onRowClick,

  renderSubRow,

  onRefresh,
  isRefreshing,
  onExport,
  exportFormats,

  savedViews,
  activeSavedView,
  onSavedViewChange,

  createAction,
  toolbarActions,

  caption,
  className,
  tableClassName,
}: EnterpriseDataTableProps<TData>) {
  const [internalDensity, setInternalDensity] = useState<TableDensity>(DEFAULT_DENSITY);
  const resolvedDensity = density ?? internalDensity;
  const handleDensityChange = (next: TableDensity) => {
    setInternalDensity(next);
    onDensityChange?.(next);
  };

  const [filtersOpen, setFiltersOpen] = useState(filtersDefaultOpen);

  const [internalFilterState, setInternalFilterState] = useState<FilterState>({});
  const resolvedFilterState = filterState ?? internalFilterState;
  const handleFilterStateChange = (next: FilterState) => {
    setInternalFilterState(next);
    onFilterStateChange?.(next);
  };

  const isDesktop = useBreakpoint('md');
  const showCards = responsive && !isDesktop;

  const willSelect = enableRowSelection !== false && (Boolean(enableRowSelection) || Boolean(bulkActions?.length));
  const willExpand = Boolean(getRowCanExpand ?? renderSubRow);
  const willShowRowActions = Boolean(rowActions);

  const effectiveColumns: ColumnDef<TData, unknown>[] = [
    ...(willSelect
      ? [
          {
            id: SELECT_COLUMN_ID,
            header: ({ table }) => (
              <Checkbox
                aria-label="Select all rows on this page"
                checked={table.getIsAllPageRowsSelected()}
                indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
                onChange={table.getToggleAllPageRowsSelectedHandler()}
              />
            ),
            cell: ({ row }) => (
              <Checkbox
                aria-label="Select row"
                checked={row.getIsSelected()}
                disabled={!row.getCanSelect()}
                onChange={row.getToggleSelectedHandler()}
              />
            ),
            enableSorting: false,
            enableHiding: false,
            meta: { hideFromColumnManager: true, align: 'center', width: 40 },
          } satisfies ColumnDef<TData, unknown>,
        ]
      : []),
    ...(willExpand
      ? [
          {
            id: EXPAND_COLUMN_ID,
            header: () => null,
            cell: ({ row }) => <ExpandToggle row={row} />,
            enableSorting: false,
            enableHiding: false,
            meta: { hideFromColumnManager: true, align: 'center', width: 40 },
          } satisfies ColumnDef<TData, unknown>,
        ]
      : []),
    ...columns,
    ...(willShowRowActions
      ? [
          {
            id: ACTIONS_COLUMN_ID,
            header: () => null,
            cell: ({ row }) => (
              <ActionsCell
                row={row.original}
                actions={typeof rowActions === 'function' ? rowActions(row.original) : (rowActions ?? [])}
              />
            ),
            enableSorting: false,
            enableHiding: false,
            meta: { hideFromColumnManager: true, align: 'right' },
          } satisfies ColumnDef<TData, unknown>,
        ]
      : []),
  ];

  const { table, selectedRows, selectedCount, totalRowCount, resetSelection } = useEnterpriseTable<TData>({
    data,
    columns: effectiveColumns,
    mode,
    getRowId,
    sorting,
    onSortingChange,
    enableSorting,
    enableMultiSort,
    globalFilter,
    onGlobalFilterChange,
    enableGlobalFilter,
    columnFilters,
    onColumnFiltersChange,
    enableColumnFilters,
    columnVisibility,
    onColumnVisibilityChange,
    rowSelection,
    onRowSelectionChange,
    enableRowSelection: willSelect,
    enablePagination,
    pagination,
    onPaginationChange,
    paginationMode,
    pageCount,
    rowCount,
    defaultPageSize,
    expanded,
    onExpandedChange,
    getRowCanExpand,
  });

  // Auto-wires simple FilterBar fields (text/select/status/boolean/checkbox/date) into TanStack
  // column filters for client-mode tables whose filter id matches a column id. Range and
  // multi-value fields are left to the caller — they need a column `filterFn` the framework
  // cannot infer. See the Server-side Integration Guide on /design-system.
  useEffect(() => {
    if (!filters || mode === 'server') return;
    const columnIds = new Set(table.getAllLeafColumns().map((column) => column.id));
    for (const field of filters) {
      if (['multiSelect', 'tags', 'numberRange', 'dateRange'].includes(field.type)) continue;
      if (!columnIds.has(field.id)) continue;
      const column = table.getColumn(field.id);
      if (!column) continue;
      const value = resolvedFilterState[field.id];
      const nextValue = isFilterValueActive(value) ? value : undefined;
      if (column.getFilterValue() !== nextValue) column.setFilterValue(nextValue);
    }
  }, [filters, mode, resolvedFilterState, table]);

  const rows = table.getRowModel().rows;
  const visibleLeafColumns = table.getVisibleLeafColumns();
  const firstColumnId = visibleLeafColumns[0]?.id;
  const columnCount = visibleLeafColumns.length || 1;

  const filterActiveCount = filters ? countActiveFilters(resolvedFilterState) : 0;
  const hasActiveQuery =
    Boolean((table.getState().globalFilter as string | undefined)?.length) ||
    table.getState().columnFilters.length > 0 ||
    filterActiveCount > 0;

  type ResolvedState = 'loading' | 'offline' | 'permission-denied' | 'error' | 'no-data' | 'no-results' | 'ready';

  const state: ResolvedState = isLoading
    ? 'loading'
    : isOffline
      ? 'offline'
      : hasPermission === false
        ? 'permission-denied'
        : isError
          ? 'error'
          : rows.length === 0
            ? hasActiveQuery
              ? 'no-results'
              : 'no-data'
            : 'ready';

  const isCardLayout = layout === 'cards';
  const showToolbar = toolbar !== false;
  // The pill row and the toolbar's Filters button are the same control in two
  // places — never render both.
  const showQuickFilters =
    (quickFilters ?? isCardLayout) && Boolean(filters?.some(isQuickFilterField));
  const showFilterButton = Boolean(filters?.length) && !showQuickFilters;

  const handleFiltersReset = () => {
    if (onFiltersReset) {
      onFiltersReset();
      return;
    }
    handleFilterStateChange({});
  };

  const emptyStateProps =
    state === 'no-results' ? noResultsState : state === 'error' ? errorState : emptyState;
  const retryAction = state === 'error' && onRetry ? <Button onClick={onRetry}>Try again</Button> : undefined;

  return (
    <div className={cn('space-y-3', className)}>
      {showToolbar && (
        <DataToolbar
          table={table}
          density={resolvedDensity}
          onDensityChange={handleDensityChange}
          searchValue={onGlobalFilterChange || globalFilter !== undefined ? (table.getState().globalFilter as string) : undefined}
          onSearchChange={enableGlobalFilter === false ? undefined : (value) => table.setGlobalFilter(value)}
          searchPlaceholder={searchPlaceholder}
          showFilterButton={showFilterButton}
          filterCount={filterActiveCount}
          filtersOpen={filtersOpen}
          onToggleFilters={() => setFiltersOpen((open) => !open)}
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
          onExport={onExport}
          exportFormats={exportFormats}
          savedViews={savedViews}
          activeSavedView={activeSavedView}
          onSavedViewChange={onSavedViewChange}
          createAction={createAction}
          actions={toolbarActions}
          {...toolbarProps}
        />
      )}

      {showQuickFilters && filters && (
        <QuickFilters
          fields={filters}
          value={resolvedFilterState}
          onChange={handleFilterStateChange}
          onOpenAllFilters={() => setFiltersOpen((open) => !open)}
          allFiltersOpen={filtersOpen}
          onReset={handleFiltersReset}
          toggles={quickFilterToggles}
        />
      )}

      {filters && filters.length > 0 && filtersOpen && (
        <FilterBar fields={filters} value={resolvedFilterState} onChange={handleFilterStateChange} onReset={onFiltersReset} />
      )}

      {bulkActions && bulkActions.length > 0 && (
        <BulkActionBar selectedRows={selectedRows} actions={bulkActions} onClearSelection={resetSelection} />
      )}

      {state === 'loading' ? (
        <TableSkeleton columns={columnCount} density={resolvedDensity} />
      ) : isCardLayout || showCards ? (
        <div className="space-y-2.5">
          {state !== 'ready' ? (
            <Card padding="lg">
              <DataTableEmptyState kind={state} {...emptyStateProps} primaryAction={retryAction} />
            </Card>
          ) : (
            rows.map((row) => {
              if (renderMobileCard && showCards) {
                return <Fragment key={row.id}>{renderMobileCard(row)}</Fragment>;
              }
              if (isCardLayout) {
                return (
                  <Fragment key={row.id}>
                    <DataRowCard row={row} badges={cardBadges?.(row.original)} onClick={onRowClick} />
                    {renderSubRow && row.getIsExpanded() && (
                      <Card padding="md" variant="filled">
                        {renderSubRow(row)}
                      </Card>
                    )}
                  </Fragment>
                );
              }
              return <MobileRowCard key={row.id} row={row} />;
            })
          )}

          {enablePagination && state === 'ready' && (
            <Card padding="none">
              <DataPagination
                table={table}
                totalRowCount={totalRowCount}
                selectedCount={selectedCount}
                className="border-t-0"
              />
            </Card>
          )}
        </div>
      ) : (
        <Card padding="none" className={cn('overflow-hidden', tableClassName)}>
          <div
            className="relative overflow-auto"
            style={stickyHeader ? { maxHeight: maxBodyHeight } : undefined}
          >
            <TableRoot>
              {caption && <TableCaption>{caption}</TableCaption>}
              <TableHeader className={cn(stickyHeader && 'sticky top-0 z-sticky')}>
                <TableRow>
                  {table.getHeaderGroups()[0]?.headers.map((header) => {
                    const meta = header.column.columnDef.meta;
                    const sticky = stickyFirstColumn && header.column.id === firstColumnId ? 'left' : undefined;
                    return (
                      <TableHead key={header.id} align={meta?.align} sticky={sticky} className={meta?.headerClassName}>
                        {header.isPlaceholder ? null : header.column.getCanSort() ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-none"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            <SortIcon direction={header.column.getIsSorted()} />
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>

              <TableBody>
                {state !== 'ready' ? (
                  <TableRow>
                    <TableCell colSpan={columnCount} className="p-0">
                      <div className="p-8">
                        <DataTableEmptyState kind={state} {...emptyStateProps} primaryAction={retryAction} />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <Fragment key={row.id}>
                      <TableRow
                        selected={row.getIsSelected()}
                        clickable={Boolean(onRowClick)}
                        onClick={() => onRowClick?.(row.original)}
                      >
                        {row.getVisibleCells().map((cell) => {
                          const meta = cell.column.columnDef.meta;
                          const sticky = stickyFirstColumn && cell.column.id === firstColumnId ? 'left' : undefined;
                          return (
                            <TableCell
                              key={cell.id}
                              align={meta?.align}
                              sticky={sticky}
                              className={cn(DENSITY_CELL_PADDING[resolvedDensity], meta?.cellClassName)}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                      {renderSubRow && row.getIsExpanded() && (
                        <TableRow>
                          <TableCell colSpan={columnCount} className={DENSITY_CELL_PADDING[resolvedDensity]}>
                            {renderSubRow(row)}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))
                )}
              </TableBody>
            </TableRoot>
          </div>

          {enablePagination && state === 'ready' && (
            <DataPagination table={table} totalRowCount={totalRowCount} selectedCount={selectedCount} />
          )}
        </Card>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Responsive card row — default `responsive` layout below `md`
 * ------------------------------------------------------------------------- */

function MobileRowCard<TData>({ row }: { row: Row<TData> }) {
  const allCells = row.getVisibleCells();
  const selectCell = allCells.find((cell) => cell.column.id === SELECT_COLUMN_ID);
  const actionsCell = allCells.find((cell) => cell.column.id === ACTIONS_COLUMN_ID);
  const fieldCells = allCells.filter((cell) => !SYNTHETIC_COLUMN_IDS.has(cell.column.id));

  return (
    <Card variant="nested" padding="sm" className="space-y-2.5">
      {(selectCell || actionsCell) && (
        <div className="flex items-center justify-between gap-2">
          <div>{selectCell && flexRender(selectCell.column.columnDef.cell, selectCell.getContext())}</div>
          <div>{actionsCell && flexRender(actionsCell.column.columnDef.cell, actionsCell.getContext())}</div>
        </div>
      )}
      <dl className="space-y-2">
        {fieldCells.map((cell) => (
          <div key={cell.id} className="flex items-baseline justify-between gap-3">
            <dt className="type-caption shrink-0 text-muted-foreground">{resolveColumnLabel(cell.column)}</dt>
            <dd className="min-w-0 text-right text-foreground">
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
