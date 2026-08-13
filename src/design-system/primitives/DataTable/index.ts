/**
 * Phase 3.1 — Enterprise Data Framework
 *
 * The reusable data management framework every module list page (Partners,
 * Vehicles, Drivers, Employees, Documents, Finance, Inventory, Reports,
 * Administration…) is built from. No module should implement its own table,
 * pagination, filtering or toolbar — compose this instead.
 *
 * Start with `EnterpriseDataTable` and `useEnterpriseTable`; the rest of this
 * barrel is exposed for advanced composition (a custom toolbar layout, a
 * bespoke empty state, driving `ColumnManager` outside the default toolbar).
 */

export { EnterpriseDataTable, type EnterpriseDataTableProps } from './EnterpriseDataTable';
export { useEnterpriseTable, type UseEnterpriseTableOptions, type UseEnterpriseTableResult } from './useEnterpriseTable';

export { DataRowCard, type DataRowCardProps } from './DataRowCard';
export { DataToolbar, type DataToolbarProps } from './DataToolbar';
export { FilterBar, type FilterBarProps } from './FilterBar';
export { isQuickFilterField, QuickFilters, type QuickFiltersProps } from './QuickFilters';
export { BulkActionBar, type BulkActionBarProps } from './BulkActionBar';
export { DataPagination, type DataPaginationProps } from './DataPagination';
export { ColumnManager, type ColumnManagerProps } from './ColumnManager';

export {
  DataTableEmptyState,
  type DataTableEmptyStateKind,
  type DataTableEmptyStateProps,
} from './DataTableStates';

export {
  CellSkeleton,
  FilterSkeleton,
  RowSkeleton,
  TableSkeleton,
  ToolbarSkeleton,
  type CellSkeletonProps,
  type FilterSkeletonProps,
  type RowSkeletonProps,
  type TableSkeletonProps,
  type ToolbarSkeletonProps,
} from './DataTableSkeletons';

export {
  ActionsCell,
  AvatarCell,
  CurrencyCell,
  DateCell,
  FileCell,
  ProgressCell,
  StatusCell,
  TagsCell,
  type ActionsCellProps,
  type AvatarCellProps,
  type CurrencyCellProps,
  type DateCellProps,
  type FileCellProps,
  type ProgressCellProps,
  type StatusCellProps,
  type TagsCellProps,
} from './cells';

export {
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
  type TableCellProps,
  type TableHeadProps,
  type TableRowProps,
} from './Table';

export {
  ACTIONS_COLUMN_ID,
  countActiveFilters,
  DEFAULT_DENSITY,
  DENSITY_CELL_PADDING,
  DENSITY_OPTIONS,
  EXPAND_COLUMN_ID,
  isFilterValueActive,
  resolveColumnLabel,
  SELECT_COLUMN_ID,
  SYNTHETIC_COLUMN_IDS,
  type BulkAction,
  type CardBadge,
  type CardFieldTheme,
  type CardSlot,
  type DataTableLayout,
  type DataTableMode,
  type DataTableStateContent,
  type DataTableStateKind,
  type DateRangeValue,
  type ExportFormat,
  type FilterFieldConfig,
  type FilterFieldType,
  type FilterOption,
  type FilterState,
  type FilterValue,
  type NumberRangeValue,
  type RowAction,
  type SavedView,
  type TableDensity,
} from './types';
