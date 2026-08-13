import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from '@/utils';

/* ---------------------------------------------------------------------------
 * Variants
 * ---------------------------------------------------------------------------
 * FLEETIN card style:
 *  - rounded-card (16 px) for outer panels, rounded-card-nested (12 px) for
 *    anything sitting inside one — see the radius tokens in index.css
 *  - border-only default — no shadow; flat and data-dense
 *  - `nested` is the list-row card: smaller radius, and the one place a shadow
 *    is used, to lift each row off the panel behind it
 *  - filled for subtle section backgrounds
 *  - ghost for zero chrome (forms, overlays)
 * ------------------------------------------------------------------------- */

const cardVariants = cva(
  'relative flex flex-col bg-surface text-foreground transition-all',
  {
    variants: {
      variant: {
        /** Default: thin border, no shadow — the standard outer panel */
        default: 'border border-border rounded-card',
        /** Elevated: adds a very subtle shadow for raised panels */
        elevated: 'border border-border rounded-card shadow-sm',
        /** Nested: a row card inside a panel — tighter radius, lifted slightly */
        nested: 'border border-border rounded-card-nested shadow-card',
        /** Flat: thinner border colour — for inner panels with no lift */
        flat: 'border border-border-subtle rounded-card-nested',
        /** Filled: sunken background — for sections and info areas */
        filled: 'bg-surface-sunken rounded-card',
        /** Ghost: no border, no background — zero chrome */
        ghost: '',
      },
      padding: {
        none: '',
        xs: 'p-3',
        sm: 'p-4',
        md: 'p-5',
        lg: 'p-6',
      },
      clickable: {
        true: 'cursor-pointer hover:border-border-strong hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      padding: 'none',
      clickable: false,
    },
  },
);

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  /** Make card a button-like clickable surface. */
  asButton?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant, padding, clickable, className, children, asButton, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      tabIndex={asButton ? 0 : undefined}
      role={asButton ? 'button' : undefined}
      className={cn(cardVariants({ variant, padding, clickable }), className)}
      {...props}
    >
      {children}
    </div>
  );
});

/* ---------------------------------------------------------------------------
 * CardHeader
 * ---------------------------------------------------------------------------
 * Horizontal or stacked row rendered above CardContent.
 * Default padding matches the compact FLEETIN card style.
 * ------------------------------------------------------------------------- */

export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  /** Stack header children vertically. Default false (horizontal). */
  stack?: boolean;
  /** Use compact top/bottom padding (px-4 pt-4 vs px-5 pt-5). */
  compact?: boolean;
}

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  function CardHeader({ stack = false, compact = false, className, children, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'flex gap-3',
          compact ? 'px-4 pt-4' : 'px-5 pt-5',
          stack ? 'flex-col items-start' : 'flex-row items-start justify-between',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);

/* ---------------------------------------------------------------------------
 * CardRow
 * ---------------------------------------------------------------------------
 * A data row below the header — separated by a thin divider. Renders
 * key-value pairs in a horizontal grid (like the FLEETIN shipment cards).
 * ------------------------------------------------------------------------- */

export interface CardRowProps extends HTMLAttributes<HTMLDivElement> {
  /** Render a top border to visually separate this row from the header. */
  bordered?: boolean;
  /** Use compact padding. */
  compact?: boolean;
}

export const CardRow = forwardRef<HTMLDivElement, CardRowProps>(
  function CardRow({ bordered = true, compact = false, className, children, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-wrap items-start gap-x-6 gap-y-2',
          compact ? 'px-4 py-3' : 'px-5 py-4',
          bordered && 'border-t border-border',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);

/* ---------------------------------------------------------------------------
 * CardField
 * ---------------------------------------------------------------------------
 * A single key-value field inside a CardRow — value above, label below.
 * Matches the compact data-display style from the FLEETIN screenshots.
 * ------------------------------------------------------------------------- */

export interface CardFieldProps extends HTMLAttributes<HTMLDivElement> {
  /** The metric / value shown in larger text. */
  value: string;
  /** The label shown in smaller muted text below the value. */
  label: string;
}

export function CardField({ value, label, className, ...props }: CardFieldProps) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)} {...props}>
      <span className="type-body-sm font-medium text-foreground">{value}</span>
      <span className="type-body-xs text-muted-foreground">{label}</span>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * CardTitle
 * ------------------------------------------------------------------------- */

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, children, ...props }, ref) {
    return (
      <h3
        ref={ref}
        className={cn('type-body-md leading-tight text-foreground', className)}
        {...props}
      >
        {children}
      </h3>
    );
  },
);

/* ---------------------------------------------------------------------------
 * CardDescription
 * ------------------------------------------------------------------------- */

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  function CardDescription({ className, children, ...props }, ref) {
    return (
      <p
        ref={ref}
        className={cn('type-body-xs text-muted-foreground', className)}
        {...props}
      >
        {children}
      </p>
    );
  },
);

/* ---------------------------------------------------------------------------
 * CardContent
 * ------------------------------------------------------------------------- */

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, children, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn('flex-1 px-5 py-4', className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);

/* ---------------------------------------------------------------------------
 * CardFooter
 * ------------------------------------------------------------------------- */

export interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds a top border above the footer. Default true. */
  bordered?: boolean;
  /** Compact padding. */
  compact?: boolean;
}

export const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
  function CardFooter({ bordered = true, compact = false, className, children, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center',
          compact ? 'px-4 pb-4 pt-3' : 'px-5 pb-5 pt-4',
          bordered && 'border-t border-border',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);

/* ---------------------------------------------------------------------------
 * CardActions
 * ------------------------------------------------------------------------- */

export interface CardActionsProps extends HTMLAttributes<HTMLDivElement> {
  /** Alignment of actions within the row. Default 'end'. */
  align?: 'start' | 'center' | 'end' | 'between';
}

const actionsAlignClasses: Record<string, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
};

export const CardActions = forwardRef<HTMLDivElement, CardActionsProps>(
  function CardActions({ align = 'end', className, children, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn('flex flex-wrap items-center gap-2', actionsAlignClasses[align], className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);
