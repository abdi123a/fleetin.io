import {
  forwardRef,
  type HTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from 'react';

import { cn } from '@/utils';

/**
 * Table — the styled `<table>` shell `EnterpriseDataTable` renders onto.
 *
 * Deliberately unopinionated about data: these are layout/styling primitives
 * only. `EnterpriseDataTable` is the only place that should reach for them —
 * a feature that needs a bespoke table still goes through
 * `EnterpriseDataTable`, never straight to these parts.
 */

export const TableRoot = forwardRef<HTMLTableElement, HTMLAttributes<HTMLTableElement>>(
  function TableRoot({ className, ...props }, ref) {
    return (
      <table
        ref={ref}
        className={cn('w-full caption-bottom border-collapse type-body-sm', className)}
        {...props}
      />
    );
  },
);

export const TableHeader = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  function TableHeader({ className, ...props }, ref) {
    return <thead ref={ref} className={cn('[&_tr]:border-b [&_tr]:border-border', className)} {...props} />;
  },
);

export const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  function TableBody({ className, ...props }, ref) {
    return (
      <tbody
        ref={ref}
        className={cn('[&_tr:last-child]:border-0 divide-y divide-border', className)}
        {...props}
      />
    );
  },
);

export const TableFooter = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  function TableFooter({ className, ...props }, ref) {
    return (
      <tfoot
        ref={ref}
        className={cn('border-t border-border bg-surface-sunken font-medium', className)}
        {...props}
      />
    );
  },
);

export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  selected?: boolean;
  clickable?: boolean;
}

export const TableRow = forwardRef<HTMLTableRowElement, TableRowProps>(function TableRow(
  { className, selected, clickable, ...props },
  ref,
) {
  return (
    <tr
      ref={ref}
      data-state={selected ? 'selected' : undefined}
      className={cn(
        'group/row transition-colors hover:bg-surface-sunken',
        selected && 'bg-primary-subtle hover:bg-primary-subtle',
        clickable && 'cursor-pointer',
        className,
      )}
      {...props}
    />
  );
});

export interface TableHeadProps extends ThHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'center' | 'right';
  sticky?: 'left' | 'right';
  stickyOffset?: number;
}

const alignClasses: Record<'left' | 'center' | 'right', string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

export const TableHead = forwardRef<HTMLTableCellElement, TableHeadProps>(function TableHead(
  { className, align = 'left', sticky, stickyOffset = 0, style, ...props },
  ref,
) {
  return (
    <th
      ref={ref}
      scope="col"
      className={cn(
        'type-label whitespace-nowrap bg-surface px-4 py-2.5 font-semibold text-muted-foreground',
        alignClasses[align],
        sticky && 'sticky z-sticky',
        sticky === 'left' && 'shadow-[1px_0_0_0_var(--border)]',
        sticky === 'right' && 'shadow-[-1px_0_0_0_var(--border)]',
        className,
      )}
      style={sticky ? { [sticky]: stickyOffset, ...style } : style}
      {...props}
    />
  );
});

export interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'center' | 'right';
  sticky?: 'left' | 'right';
  stickyOffset?: number;
}

export const TableCell = forwardRef<HTMLTableCellElement, TableCellProps>(function TableCell(
  { className, align = 'left', sticky, stickyOffset = 0, style, ...props },
  ref,
) {
  return (
    <td
      ref={ref}
      className={cn(
        'px-4 align-middle text-foreground',
        alignClasses[align],
        sticky && 'sticky z-sticky bg-surface group-hover/row:bg-surface-sunken group-data-[state=selected]/row:bg-primary-subtle',
        sticky === 'left' && 'shadow-[1px_0_0_0_var(--border)]',
        sticky === 'right' && 'shadow-[-1px_0_0_0_var(--border)]',
        className,
      )}
      style={sticky ? { [sticky]: stickyOffset, ...style } : style}
      {...props}
    />
  );
});

export const TableCaption = forwardRef<HTMLTableCaptionElement, HTMLAttributes<HTMLTableCaptionElement>>(
  function TableCaption({ className, ...props }, ref) {
    return <caption ref={ref} className={cn('sr-only', className)} {...props} />;
  },
);
