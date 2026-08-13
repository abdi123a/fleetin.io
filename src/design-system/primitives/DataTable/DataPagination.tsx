import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from '@/design-system/icons';

import { useState, type ChangeEvent, type KeyboardEvent } from 'react';
import type { Table } from '@tanstack/react-table';

import { IconButton } from '@/design-system/primitives/Button';
import { Input } from '@/design-system/primitives/Input';
import { Select } from '@/design-system/primitives/SelectionControls';
import { cn } from '@/utils';

/**
 * DataPagination — the standard pager for every `EnterpriseDataTable`.
 *
 * Reads and drives a TanStack `Table` instance directly (typically the one
 * returned by `useEnterpriseTable`), so page index/size stay in exactly one
 * place. `totalRowCount` is required rather than derived, because in
 * server mode the table only ever holds the current page of rows.
 */

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export interface DataPaginationProps<TData> {
  table: Table<TData>;
  /** Total rows across every page — from `useEnterpriseTable`'s `totalRowCount`. */
  totalRowCount: number;
  pageSizeOptions?: number[];
  /** Shows a "N selected" indicator next to the row range. */
  selectedCount?: number;
  showJumpToPage?: boolean;
  className?: string;
}

export function DataPagination<TData>({
  table,
  totalRowCount,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  selectedCount,
  showJumpToPage = true,
  className,
}: DataPaginationProps<TData>) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const rawPageCount = table.getPageCount();
  const pageCount = rawPageCount >= 0 ? rawPageCount : Math.max(1, Math.ceil(totalRowCount / pageSize));
  const currentPage = pageIndex + 1;

  const [jumpValue, setJumpValue] = useState('');

  const commitJump = () => {
    const target = Number(jumpValue);
    if (!Number.isFinite(target) || target < 1) {
      setJumpValue('');
      return;
    }
    table.setPageIndex(Math.min(Math.max(target - 1, 0), pageCount - 1));
    setJumpValue('');
  };

  const rangeStart = totalRowCount === 0 ? 0 : pageIndex * pageSize + 1;
  const rangeEnd = Math.min(totalRowCount, (pageIndex + 1) * pageSize);

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-4 border-t border-border px-4 py-3',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-4 type-body-xs text-muted-foreground">
        <span>{totalRowCount === 0 ? 'No rows' : `${rangeStart}–${rangeEnd} of ${totalRowCount}`}</span>
        {selectedCount !== undefined && selectedCount > 0 && (
          <span className="font-medium text-foreground">{selectedCount} selected</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="type-body-xs whitespace-nowrap text-muted-foreground">Rows per page</span>
          <Select
            selectSize="sm"
            className="w-20"
            value={String(pageSize)}
            onChange={(event) => table.setPageSize(Number(event.target.value))}
            options={pageSizeOptions.map((size) => ({ value: String(size), label: String(size) }))}
            aria-label="Rows per page"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="type-body-xs whitespace-nowrap text-muted-foreground">
            Page {currentPage} of {pageCount}
          </span>

          {showJumpToPage && (
            <Input
              inputSize="sm"
              className="w-14"
              placeholder="Go"
              value={jumpValue}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setJumpValue(event.target.value.replace(/\D/g, ''))
              }
              onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                if (event.key === 'Enter') commitJump();
              }}
              aria-label="Jump to page"
            />
          )}
        </div>

        <div className="flex items-center gap-1">
          <IconButton
            aria-label="First page"
            variant="outline"
            size="sm"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.setPageIndex(0)}
          >
            <ChevronsLeft />
          </IconButton>
          <IconButton
            aria-label="Previous page"
            variant="outline"
            size="sm"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            <ChevronLeft />
          </IconButton>
          <IconButton
            aria-label="Next page"
            variant="outline"
            size="sm"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            <ChevronRight />
          </IconButton>
          <IconButton
            aria-label="Last page"
            variant="outline"
            size="sm"
            disabled={!table.getCanNextPage()}
            onClick={() => table.setPageIndex(pageCount - 1)}
          >
            <ChevronsRight />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
