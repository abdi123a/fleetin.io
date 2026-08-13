import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/utils';
import { IconChip } from '../IconChip/IconChip';

/* ===========================================================================
 * DescriptionList
 * =========================================================================== */

export type DescriptionListLayout = 'stacked' | 'horizontal' | 'grid';

export interface DescriptionListProps extends HTMLAttributes<HTMLDListElement> {
  layout?: DescriptionListLayout;
  /** Number of grid columns when layout="grid". Default 2. */
  cols?: 1 | 2 | 3 | 4;
  dense?: boolean;
}

const colClasses: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
};

export const DescriptionList = forwardRef<HTMLDListElement, DescriptionListProps>(
  function DescriptionList(
    { layout = 'stacked', cols = 2, dense = false, className, children, ...props },
    ref,
  ) {
    return (
      <dl
        ref={ref}
        className={cn(
          layout === 'grid' && ['grid gap-x-6', colClasses[cols], dense ? 'gap-y-2' : 'gap-y-4'],
          layout === 'stacked' && ['flex flex-col', dense ? 'gap-2' : 'gap-4'],
          layout === 'horizontal' && ['flex flex-col divide-y divide-border'],
          className,
        )}
        {...props}
      >
        {children}
      </dl>
    );
  },
);

/* ===========================================================================
 * DescriptionItem (Key / Value pair)
 * =========================================================================== */

export interface DescriptionItemProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  value: ReactNode;
  horizontal?: boolean;
  icon?: ReactNode;
}

export const DescriptionItem = forwardRef<HTMLDivElement, DescriptionItemProps>(
  function DescriptionItem({ label, value, horizontal = false, icon, className, ...props }, ref) {
    if (horizontal) {
      return (
        <div ref={ref} className={cn('flex items-center justify-between py-2.5 first:pt-0 last:pb-0 gap-4', className)} {...props}>
          <dt className="flex items-center gap-1.5 type-body-xs font-medium text-muted-foreground">
            {icon && <span className="shrink-0 text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>}
            {label}
          </dt>
          <dd className="type-body-sm font-medium text-foreground text-right">{value ?? '—'}</dd>
        </div>
      );
    }

    return (
      <div ref={ref} className={cn('flex flex-col gap-0.5', className)} {...props}>
        <dt className="flex items-center gap-1.5 type-body-xs text-muted-foreground">
          {icon && <span className="shrink-0 text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>}
          {label}
        </dt>
        <dd className="type-body-sm font-medium text-foreground">{value ?? '—'}</dd>
      </div>
    );
  },
);

/* ===========================================================================
 * KeyValueList
 * =========================================================================== */

export interface KeyValueItem {
  key: string;
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
}

export interface KeyValueListProps extends HTMLAttributes<HTMLDListElement> {
  items: KeyValueItem[];
  bordered?: boolean;
  dense?: boolean;
}

export function KeyValueList({ items, bordered = false, dense = false, className, ...props }: KeyValueListProps) {
  return (
    <dl
      className={cn(
        'flex flex-col',
        bordered ? 'divide-y divide-border border border-border rounded-md bg-surface px-4' : dense ? 'gap-2' : 'gap-3',
        className,
      )}
      {...props}
    >
      {items.map((item) => (
        <DescriptionItem
          key={item.key}
          label={item.label}
          value={item.value}
          icon={item.icon}
          horizontal={bordered}
          className={bordered ? undefined : undefined}
        />
      ))}
    </dl>
  );
}

/* ===========================================================================
 * PropertyList
 * =========================================================================== */

export interface PropertyItem {
  key: string;
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  badge?: ReactNode;
}

export interface PropertyListProps extends HTMLAttributes<HTMLDivElement> {
  properties: PropertyItem[];
  cols?: 1 | 2 | 3 | 4;
}

export function PropertyList({ properties, cols = 2, className, ...props }: PropertyListProps) {
  return (
    <div className={cn('grid gap-4', colClasses[cols], className)} {...props}>
      {properties.map((prop) => (
        <div key={prop.key} className="flex items-start gap-3 rounded-md border border-border bg-surface p-3.5">
          {prop.icon && (
            <IconChip size={36}>{prop.icon}</IconChip>
          )}
          <div className="flex-1 min-w-0">
            <p className="type-body-xs text-muted-foreground">{prop.label}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="type-body-sm text-foreground truncate">{prop.value ?? '—'}</span>
              {prop.badge}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ===========================================================================
 * MetadataList
 * =========================================================================== */

export interface MetadataEntry {
  label: string;
  value: ReactNode;
}

export interface MetadataListProps extends HTMLAttributes<HTMLDivElement> {
  entries: MetadataEntry[];
  inline?: boolean;
}

export function MetadataList({ entries, inline = false, className, ...props }: MetadataListProps) {
  if (inline) {
    return (
      <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 type-body-xs text-muted-foreground', className)} {...props}>
        {entries.map((entry, idx) => (
          <div key={entry.label} className="flex items-center gap-1">
            {idx > 0 && <span className="text-border mr-1">•</span>}
            <span className="text-muted-foreground">{entry.label}:</span>
            <span className="font-medium text-foreground">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-md bg-surface-sunken p-3.5', className)} {...props}>
      {entries.map((entry) => (
        <div key={entry.label} className="space-y-0.5">
          <p className="type-body-2xs text-muted-foreground uppercase tracking-wider">{entry.label}</p>
          <p className="type-body-xs font-medium text-foreground">{entry.value ?? '—'}</p>
        </div>
      ))}
    </div>
  );
}
