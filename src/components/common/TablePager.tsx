import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from '@/design-system/icons';
import { Select } from '@/design-system';
import { cn } from '@/utils';

/**
 * The pager every long table in the app wears.
 *
 * A card that lists 450 empty-return cycles in one column is not a table, it is
 * a scroll — the reader loses the row above and has no way to say "the third
 * page". So the long lists show one page at a time and carry numbered pages
 * beneath them.
 *
 * Numbered rather than infinite-scroll, and numbered rather than a bare
 * next/previous: a dispatcher working a deadline list needs to come back to
 * where they were, and a page number is the only address that survives a
 * reload.
 *
 * Lived under `pages/transporter-portal` until the Empty Return Cycles board
 * needed the same thing; promoted here rather than copied, so page size,
 * range readout and keyboard target stay identical wherever a table gets long.
 */

/** Rows per page across the app's long tables. */
export const TABLE_PAGE_SIZE = 12;

/** What the rows-per-page control offers when a table asks for one. */
export const TABLE_PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

/** Row counts print in full — "1,240 cycles", never "1.2k". */
const countFormatter = new Intl.NumberFormat('en-US');

export interface PagedRows<T> {
  /** The slice to render. */
  rows: T[];
  /** 1-based, already clamped to the available range. */
  page: number;
  setPage: (page: number) => void;
  pageCount: number;
  /** 1-based index of the first row shown, or 0 when there are none. */
  rangeStart: number;
  /** 1-based index of the last row shown. */
  rangeEnd: number;
  total: number;
  pageSize: number;
}

/**
 * Slice `all` into pages.
 *
 * `resetKey` is anything that changes what the list contains — a search term, a
 * status filter, a date window. When it changes the reader is looking at a
 * different list, and page 4 of the old one means nothing in the new one.
 */
export function usePagedRows<T>(
  all: readonly T[],
  { pageSize = TABLE_PAGE_SIZE, resetKey }: { pageSize?: number; resetKey?: unknown } = {},
): PagedRows<T> {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  // Page size is a prop, so a change to it is also a change of list shape:
  // page 9 of 12-row pages is off the end once the reader asks for 100.
  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  const pageCount = Math.max(1, Math.ceil(all.length / pageSize));
  // Clamped rather than corrected in an effect: a filter that shortens the list
  // must not render one frame of an empty page on its way to being fixed.
  const safePage = Math.min(Math.max(page, 1), pageCount);
  const start = (safePage - 1) * pageSize;
  const rows = useMemo(() => all.slice(start, start + pageSize), [all, start, pageSize]);

  return {
    rows,
    page: safePage,
    setPage,
    pageCount,
    rangeStart: all.length === 0 ? 0 : start + 1,
    rangeEnd: Math.min(start + pageSize, all.length),
    total: all.length,
    pageSize,
  };
}

export interface TablePagerProps {
  paged: Pick<
    PagedRows<unknown>,
    'page' | 'setPage' | 'pageCount' | 'rangeStart' | 'rangeEnd' | 'total'
  >;
  /** What the rows are, for the readout: "of 152 invoices". */
  noun?: string;
  /** An extra figure worth stating beside the range — a sum, a total. */
  summary?: ReactNode;
  /** Current rows-per-page. Pass with `onPageSizeChange` to show the control. */
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: readonly number[];
  className?: string;
}

export function TablePager({
  paged,
  noun,
  summary,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = TABLE_PAGE_SIZE_OPTIONS,
  className,
}: TablePagerProps) {
  const { page, setPage, pageCount, rangeStart, rangeEnd, total } = paged;
  const pageNumbers = useMemo(() => buildPageNumbers(page, pageCount), [page, pageCount]);
  const showPageSize = pageSize !== undefined && onPageSizeChange !== undefined;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {total === 0
            ? `0 of 0${noun ? ` ${noun}` : ''}`
            : `${countFormatter.format(rangeStart)}–${countFormatter.format(rangeEnd)} of ${countFormatter.format(total)}${noun ? ` ${noun}` : ''}`}
        </span>
        {summary ? (
          <>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">{summary}</span>
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {showPageSize ? (
          <div className="flex items-center gap-1.5">
            <span className="hidden whitespace-nowrap text-xs text-muted-foreground sm:inline">
              Rows
            </span>
            <Select
              selectSize="sm"
              containerClassName="w-[4.75rem]"
              value={String(pageSize)}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              options={pageSizeOptions.map((size) => ({ value: String(size), label: String(size) }))}
              aria-label="Rows per page"
            />
          </div>
        ) : null}

        {pageCount > 1 ? (
          <nav className="flex items-center gap-1" aria-label="Pagination">
            <PageButton label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="size-3.5" />
            </PageButton>

            {pageNumbers.map((entry) =>
              entry.kind === 'gap' ? (
                <span
                  key={`gap-${entry.before}`}
                  className="flex size-8 items-center justify-center text-xs text-muted-foreground"
                  aria-hidden
                >
                  …
                </span>
              ) : (
                <PageButton
                  key={entry.page}
                  label={`Page ${entry.page}`}
                  active={entry.page === page}
                  onClick={() => setPage(entry.page)}
                >
                  {entry.page}
                </PageButton>
              ),
            )}

            <PageButton
              label="Next page"
              disabled={page >= pageCount}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="size-3.5" />
            </PageButton>
          </nav>
        ) : null}
      </div>
    </div>
  );
}

function PageButton({
  label,
  children,
  disabled,
  active,
  onClick,
}: {
  label: string;
  children: ReactNode;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex size-8 items-center justify-center rounded-md text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        'disabled:pointer-events-none disabled:opacity-40',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

type PageEntry = { kind: 'page'; page: number } | { kind: 'gap'; before: number };

/**
 * First, last, current and its neighbours — everything else collapses to an
 * ellipsis. Seven or fewer pages fit whole, including on a phone.
 */
function buildPageNumbers(current: number, total: number): PageEntry[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => ({
      kind: 'page' as const,
      page: index + 1,
    }));
  }

  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = Array.from(pages)
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b);

  const result: PageEntry[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const page = sorted[index];
    if (page === undefined) continue;
    const prev = sorted[index - 1];
    if (prev !== undefined && page - prev > 1) {
      result.push({ kind: 'gap', before: page });
    }
    result.push({ kind: 'page', page });
  }
  return result;
}
