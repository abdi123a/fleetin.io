import { Skeleton } from '@/design-system/primitives/Skeleton';
import { cn } from '@/utils';

import { TableBody, TableCell, TableHead, TableHeader, TableRoot, TableRow } from './Table';
import { DEFAULT_DENSITY, DENSITY_CELL_PADDING, type TableDensity } from './types';

/**
 * Loading placeholders for every part of the Enterprise Data Framework.
 *
 * `TableSkeleton` is what `EnterpriseDataTable` renders for `isLoading` on
 * first load. `RowSkeleton` is for appending a page during infinite-scroll or
 * "load more" flows. `ToolbarSkeleton` / `FilterSkeleton` are for a page shell
 * that wants to reserve the toolbar/filter layout before the table mounts.
 */

const HEADER_WIDTHS = ['45%', '70%', '55%', '65%', '40%', '60%'];
const CELL_WIDTHS = ['85%', '65%', '75%', '55%', '70%', '50%'];

function widthAt(list: string[], index: number): string {
  return list[index % list.length] ?? '70%';
}

export interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  density?: TableDensity;
  showHeader?: boolean;
  className?: string;
}

export function TableSkeleton({
  rows = 8,
  columns = 5,
  density = DEFAULT_DENSITY,
  showHeader = true,
  className,
}: TableSkeletonProps) {
  const padding = DENSITY_CELL_PADDING[density];
  const columnKeys = Array.from({ length: columns }, (_, i) => `col-${i}`);
  const rowKeys = Array.from({ length: rows }, (_, i) => `row-${i}`);

  return (
    <div
      className={cn('overflow-hidden rounded-card border border-border', className)}
      role="presentation"
      aria-hidden
    >
      <TableRoot>
        {showHeader && (
          <TableHeader>
            <TableRow>
              {columnKeys.map((key, idx) => (
                <TableHead key={key} className={padding}>
                  <Skeleton className="h-3.5" style={{ width: widthAt(HEADER_WIDTHS, idx) }} shape="text" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
        )}
        <TableBody>
          {rowKeys.map((rowKey) => (
            <TableRow key={rowKey}>
              {columnKeys.map((colKey, idx) => (
                <TableCell key={colKey} className={padding}>
                  <Skeleton className="h-4" style={{ width: widthAt(CELL_WIDTHS, idx) }} shape="text" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </TableRoot>
    </div>
  );
}

export interface RowSkeletonProps {
  columns?: number;
  density?: TableDensity;
}

export function RowSkeleton({ columns = 5, density = DEFAULT_DENSITY }: RowSkeletonProps) {
  const padding = DENSITY_CELL_PADDING[density];
  const columnKeys = Array.from({ length: columns }, (_, i) => `col-${i}`);

  return (
    <TableRow role="presentation" aria-hidden>
      {columnKeys.map((key, idx) => (
        <TableCell key={key} className={padding}>
          <Skeleton className="h-4" style={{ width: widthAt(CELL_WIDTHS, idx) }} shape="text" />
        </TableCell>
      ))}
    </TableRow>
  );
}

export interface CellSkeletonProps {
  width?: string | number;
}

export function CellSkeleton({ width = '70%' }: CellSkeletonProps) {
  return <Skeleton className="h-4" style={{ width }} shape="text" />;
}

export interface ToolbarSkeletonProps {
  className?: string;
}

export function ToolbarSkeleton({ className }: ToolbarSkeletonProps) {
  return (
    <div
      className={cn('flex flex-wrap items-center justify-between gap-3', className)}
      role="presentation"
      aria-hidden
    >
      <Skeleton className="h-9 w-64 rounded-md" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-9 rounded-md" />
        <Skeleton className="h-9 w-9 rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>
    </div>
  );
}

export interface FilterSkeletonProps {
  fields?: number;
  className?: string;
}

export function FilterSkeleton({ fields = 4, className }: FilterSkeletonProps) {
  const keys = Array.from({ length: fields }, (_, i) => `filter-${i}`);

  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)} role="presentation" aria-hidden>
      {keys.map((key) => (
        <Skeleton key={key} className="h-9 w-36 rounded-md" />
      ))}
    </div>
  );
}
