import { Download, Filter, RefreshCw, Rows3, Search } from '@/design-system/icons';

import type { ChangeEvent, ReactNode } from 'react';
import type { Table } from '@tanstack/react-table';

import { Badge } from '@/design-system/primitives/Badge';
import { Button, IconButton } from '@/design-system/primitives/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { Input } from '@/design-system/primitives/Input';
import { Select } from '@/design-system/primitives/SelectionControls';
import { cn } from '@/utils';

import { ColumnManager } from './ColumnManager';
import { DENSITY_OPTIONS, type ExportFormat, type SavedView, type TableDensity } from './types';

/**
 * DataToolbar — the standard header row above an `EnterpriseDataTable`.
 *
 * Every capability is optional and only renders when the corresponding prop
 * is supplied — a module that just wants a search box passes `searchValue` +
 * `onSearchChange` and gets nothing else. `createAction` and `actions` are
 * the two escape hatches for anything the framework doesn't model directly.
 */

export interface DataToolbarProps<TData> {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;

  /** Quick filter chips / toggle group, rendered next to the search box. */
  quickFilters?: ReactNode;

  showFilterButton?: boolean;
  filterCount?: number;
  filtersOpen?: boolean;
  onToggleFilters?: () => void;

  onRefresh?: () => void;
  isRefreshing?: boolean;

  /** Single export action — renders a plain button. Ignored when `exportFormats` is set. */
  onExport?: () => void;
  /** Multiple export formats — renders a dropdown. */
  exportFormats?: ExportFormat[];

  density?: TableDensity;
  onDensityChange?: (density: TableDensity) => void;

  /** Table instance — required for the built-in Column Manager trigger. */
  table?: Table<TData>;
  showColumnManager?: boolean;

  savedViews?: SavedView[];
  activeSavedView?: string;
  onSavedViewChange?: (id: string) => void;

  /** Right-aligned primary "Create" button slot. */
  createAction?: ReactNode;
  /** Additional right-aligned custom actions. */
  actions?: ReactNode;

  className?: string;
}

export function DataToolbar<TData>({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search…',
  quickFilters,
  showFilterButton = false,
  filterCount = 0,
  filtersOpen = false,
  onToggleFilters,
  onRefresh,
  isRefreshing = false,
  onExport,
  exportFormats,
  density,
  onDensityChange,
  table,
  showColumnManager = true,
  savedViews,
  activeSavedView,
  onSavedViewChange,
  createAction,
  actions,
  className,
}: DataToolbarProps<TData>) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {onSearchChange && (
          <Input
            inputSize="sm"
            className="w-full max-w-xs"
            leadingIcon={<Search className="h-4 w-4" />}
            placeholder={searchPlaceholder}
            value={searchValue ?? ''}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onSearchChange(event.target.value)}
            isClearable
            onClear={() => onSearchChange('')}
            aria-label="Search"
          />
        )}

        {quickFilters}

        {showFilterButton && (
          <Button
            variant={filtersOpen ? 'subtle' : 'outline'}
            size="sm"
            leadingIcon={<Filter />}
            onClick={onToggleFilters}
          >
            Filters
            {filterCount > 0 && (
              <Badge intent="primary" size="sm">
                {filterCount}
              </Badge>
            )}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {savedViews && savedViews.length > 0 && (
          <Select
            selectSize="sm"
            className="w-40"
            placeholder="Saved views"
            value={activeSavedView ?? ''}
            onChange={(event) => onSavedViewChange?.(event.target.value)}
            options={savedViews.map((view) => ({ value: view.id, label: view.label }))}
            aria-label="Saved views"
          />
        )}

        {table && showColumnManager && <ColumnManager table={table} />}

        {onDensityChange && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton aria-label="Row density" variant="outline" size="sm">
                <Rows3 />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Row density</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                value={density}
                onValueChange={(value) => onDensityChange(value as TableDensity)}
              >
                {DENSITY_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {exportFormats && exportFormats.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" leadingIcon={<Download />}>
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {exportFormats.map((format) => (
                <DropdownMenuItem key={format.id} onSelect={format.onExport}>
                  {format.icon}
                  {format.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          onExport && (
            <Button variant="outline" size="sm" leadingIcon={<Download />} onClick={onExport}>
              Export
            </Button>
          )
        )}

        {onRefresh && (
          <IconButton
            aria-label="Refresh"
            variant="outline"
            size="sm"
            isLoading={isRefreshing}
            onClick={onRefresh}
          >
            <RefreshCw />
          </IconButton>
        )}

        {actions}
        {createAction}
      </div>
    </div>
  );
}
