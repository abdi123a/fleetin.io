import { forwardRef, type HTMLAttributes } from 'react';


import { cn } from '@/utils';

/* ---------------------------------------------------------------------------
 * Grid
 * ---------------------------------------------------------------------------
 * CSS-grid wrapper with column-count and gap token support.
 * Responsive overrides are expressed via the sm/md/lg props.
 * ------------------------------------------------------------------------- */

type ColCount = '1' | '2' | '3' | '4' | '6' | '12';

const colClasses: Record<ColCount, string> = {
  '1': 'grid-cols-1',
  '2': 'grid-cols-2',
  '3': 'grid-cols-3',
  '4': 'grid-cols-4',
  '6': 'grid-cols-6',
  '12': 'grid-cols-12',
};

const smColClasses: Record<ColCount, string> = {
  '1': 'sm:grid-cols-1',
  '2': 'sm:grid-cols-2',
  '3': 'sm:grid-cols-3',
  '4': 'sm:grid-cols-4',
  '6': 'sm:grid-cols-6',
  '12': 'sm:grid-cols-12',
};

const mdColClasses: Record<ColCount, string> = {
  '1': 'md:grid-cols-1',
  '2': 'md:grid-cols-2',
  '3': 'md:grid-cols-3',
  '4': 'md:grid-cols-4',
  '6': 'md:grid-cols-6',
  '12': 'md:grid-cols-12',
};

const lgColClasses: Record<ColCount, string> = {
  '1': 'lg:grid-cols-1',
  '2': 'lg:grid-cols-2',
  '3': 'lg:grid-cols-3',
  '4': 'lg:grid-cols-4',
  '6': 'lg:grid-cols-6',
  '12': 'lg:grid-cols-12',
};

const gapClasses: Record<string, string> = {
  '0': 'gap-0',
  '1': 'gap-1',
  '2': 'gap-2',
  '3': 'gap-3',
  '4': 'gap-4',
  '5': 'gap-5',
  '6': 'gap-6',
  '8': 'gap-8',
  '10': 'gap-10',
  '12': 'gap-12',
};

export interface GridProps extends HTMLAttributes<HTMLDivElement> {
  /** Number of columns at default (mobile-first) breakpoint. */
  cols?: ColCount;
  /** Column count override at sm breakpoint (640px+). */
  sm?: ColCount;
  /** Column count override at md breakpoint (768px+). */
  md?: ColCount;
  /** Column count override at lg breakpoint (1024px+). */
  lg?: ColCount;
  /** Gap between grid cells (design-system scale). Default '4'. */
  gap?: '0' | '1' | '2' | '3' | '4' | '5' | '6' | '8' | '10' | '12';
}

export const Grid = forwardRef<HTMLDivElement, GridProps>(function Grid(
  { cols = '1', sm, md, lg, gap = '4', className, children, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'grid',
        colClasses[cols],
        sm && smColClasses[sm],
        md && mdColClasses[md],
        lg && lgColClasses[lg],
        gapClasses[gap],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});

/* ---------------------------------------------------------------------------
 * GridItem
 * ---------------------------------------------------------------------------
 * Wraps a grid child and allows setting col-span and row-span values.
 * ------------------------------------------------------------------------- */

type SpanCount = '1' | '2' | '3' | '4' | '6' | '12' | 'full';

const colSpanClasses: Record<SpanCount, string> = {
  '1': 'col-span-1',
  '2': 'col-span-2',
  '3': 'col-span-3',
  '4': 'col-span-4',
  '6': 'col-span-6',
  '12': 'col-span-12',
  full: 'col-span-full',
};

const rowSpanClasses: Record<SpanCount, string> = {
  '1': 'row-span-1',
  '2': 'row-span-2',
  '3': 'row-span-3',
  '4': 'row-span-4',
  '6': 'row-span-6',
  '12': 'row-span-12',
  full: 'row-span-full',
};

export interface GridItemProps extends HTMLAttributes<HTMLDivElement> {
  /** Column span. */
  colSpan?: SpanCount;
  /** Row span. */
  rowSpan?: SpanCount;
}

export const GridItem = forwardRef<HTMLDivElement, GridItemProps>(function GridItem(
  { colSpan, rowSpan, className, children, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        colSpan && colSpanClasses[colSpan],
        rowSpan && rowSpanClasses[rowSpan],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});
