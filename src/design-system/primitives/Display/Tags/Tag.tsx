import { X } from '@/design-system/icons';

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/utils';

/* ===========================================================================
 * Tag
 * =========================================================================== */

export type TagVariant = 'subtle' | 'outline' | 'solid';
export type TagIntent = 'default' | 'primary' | 'success' | 'warning' | 'destructive' | 'info';

const tagVariantClasses: Record<TagVariant, Record<TagIntent, string>> = {
  subtle: {
    default: 'bg-muted text-muted-foreground border-transparent',
    primary: 'bg-primary-subtle text-primary-subtle-foreground border-transparent',
    success: 'bg-success-subtle text-success-subtle-foreground border-transparent',
    warning: 'bg-warning-subtle text-warning-subtle-foreground border-transparent',
    destructive: 'bg-destructive-subtle text-destructive-subtle-foreground border-transparent',
    info: 'bg-info-subtle text-info-subtle-foreground border-transparent',
  },
  outline: {
    default: 'bg-transparent text-foreground border-border-strong',
    primary: 'bg-transparent text-primary border-primary',
    success: 'bg-transparent text-success border-success',
    warning: 'bg-transparent text-warning border-warning',
    destructive: 'bg-transparent text-destructive border-destructive',
    info: 'bg-transparent text-info border-info',
  },
  solid: {
    default: 'bg-secondary text-secondary-foreground border-transparent',
    primary: 'bg-primary text-primary-foreground border-transparent',
    success: 'bg-success text-success-foreground border-transparent',
    warning: 'bg-warning text-warning-foreground border-transparent',
    destructive: 'bg-destructive text-destructive-foreground border-transparent',
    info: 'bg-info text-info-foreground border-transparent',
  },
};

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: TagVariant;
  intent?: TagIntent;
  icon?: ReactNode;
  onRemove?: () => void;
  disabled?: boolean;
}

export const Tag = forwardRef<HTMLSpanElement, TagProps>(function Tag(
  { variant = 'subtle', intent = 'default', icon, onRemove, disabled, className, children, ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 type-body-xs font-medium transition-colors',
        tagVariantClasses[variant][intent],
        disabled && 'opacity-50 pointer-events-none',
        className,
      )}
      {...props}
    >
      {icon && <span className="shrink-0 [&_svg]:h-3 [&_svg]:w-3">{icon}</span>}
      <span>{children}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          disabled={disabled}
          className="shrink-0 rounded-sm p-0.5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors focus:outline-none"
          aria-label="Remove tag"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
});

/* ===========================================================================
 * Chip
 * =========================================================================== */

export interface ChipProps extends HTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { selected = false, disabled = false, icon, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 type-body-xs font-medium transition select-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary',
        selected
          ? 'bg-primary text-primary-foreground border-primary shadow-xs'
          : 'bg-surface text-foreground border-border hover:border-border-strong hover:bg-surface-sunken',
        disabled && 'opacity-50 cursor-not-allowed pointer-events-none',
        className,
      )}
      {...props}
    >
      {icon && <span className="shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>}
      <span>{children}</span>
    </button>
  );
});

/* ===========================================================================
 * Pill
 * =========================================================================== */

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  intent?: TagIntent;
  dot?: boolean;
}

const dotColors: Record<TagIntent, string> = {
  default: 'bg-muted-foreground',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  info: 'bg-info',
};

export const Pill = forwardRef<HTMLSpanElement, PillProps>(function Pill(
  { intent = 'default', dot = true, className, children, ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-0.5 type-body-xs font-medium text-foreground',
        className,
      )}
      {...props}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', dotColors[intent])} />}
      <span>{children}</span>
    </span>
  );
});

/* ===========================================================================
 * Category
 * =========================================================================== */

export interface CategoryProps extends HTMLAttributes<HTMLSpanElement> {
  accentColor?: string;
}

export const Category = forwardRef<HTMLSpanElement, CategoryProps>(function Category(
  { accentColor, className, children, ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-2 type-body-xs tracking-wider uppercase text-foreground',
        className,
      )}
      {...props}
    >
      <span
        className="h-3 w-1 rounded-full bg-primary shrink-0"
        style={accentColor ? { backgroundColor: accentColor } : undefined}
      />
      <span>{children}</span>
    </span>
  );
});

/* ===========================================================================
 * Labels
 * =========================================================================== */

export interface LabelsProps extends HTMLAttributes<HTMLDivElement> {
  max?: number;
  items: ReactNode[];
}

export const Labels = forwardRef<HTMLDivElement, LabelsProps>(function Labels(
  { max = 3, items, className, ...props },
  ref,
) {
  const visible = items.slice(0, max);
  const overflow = items.length - max;

  return (
    <div ref={ref} className={cn('flex flex-wrap items-center gap-1.5', className)} {...props}>
      {visible.map((item) => (
        <span key={item && typeof item === 'object' && 'key' in item && item.key ? String(item.key) : undefined}>
          {item}
        </span>
      ))}
      {overflow > 0 && (
        <Pill intent="default" dot={false} className="text-muted-foreground">
          +{overflow}
        </Pill>
      )}
    </div>
  );
});
