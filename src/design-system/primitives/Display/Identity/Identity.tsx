import {
  FileSpreadsheet,
  FileText,
  Image,
  Truck,
} from '@/design-system/icons';

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import { Avatar, type AvatarProps } from '@/design-system/primitives/Avatar';
import { cn } from '@/utils';

/* ---------------------------------------------------------------------------
 * AvatarGroup
 * ---------------------------------------------------------------------------
 * Renders a horizontal stack of overlapping avatars with a +N overflow count.
 * ------------------------------------------------------------------------- */

export interface AvatarGroupItem {
  name?: string;
  src?: string;
  fallback?: string;
}

export interface AvatarGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** List of avatar data. */
  items: AvatarGroupItem[];
  /** Maximum avatars shown before +N overflow. Default 4. */
  max?: number;
  /** Size passed to each Avatar. */
  size?: AvatarProps['size'];
}

export const AvatarGroup = forwardRef<HTMLDivElement, AvatarGroupProps>(
  function AvatarGroup({ items, max = 4, size = 'sm', className, ...props }, ref) {
    const visible = items.slice(0, max);
    const overflow = items.length - max;

    return (
      <div ref={ref} className={cn('flex items-center', className)} {...props}>
        {visible.map((item, idx) => (
          <Avatar
            key={item.name ?? idx}
            src={item.src}
            name={item.name}
            fallback={item.fallback}
            size={size}
            className={cn(
              'ring-2 ring-surface',
              idx > 0 && '-ml-2',
            )}
          />
        ))}
        {overflow > 0 && (
          <span
            className={cn(
              'relative -ml-2 flex shrink-0 items-center justify-center rounded-full bg-muted ring-2 ring-surface font-semibold text-muted-foreground select-none',
              size === 'xs' && 'size-6 text-2xs',
              size === 'sm' && 'size-8 text-xs',
              (size === 'md' || !size) && 'size-9 text-xs',
              size === 'lg' && 'size-11 text-sm',
              size === 'xl' && 'size-14 text-sm',
            )}
          >
            +{overflow}
          </span>
        )}
      </div>
    );
  },
);

/* ---------------------------------------------------------------------------
 * UserAvatar
 * ---------------------------------------------------------------------------
 * Person avatar (circle) with optional online presence dot.
 * ------------------------------------------------------------------------- */

export interface UserAvatarProps extends AvatarProps {
  /** Show a live presence dot (green = online, grey = offline). */
  online?: boolean | null;
}

export const UserAvatar = forwardRef<HTMLElement, UserAvatarProps>(
  function UserAvatar({ online, size = 'md', className, ...props }, ref) {
    return (
      <span className="relative inline-flex">
        <Avatar
          ref={ref as React.Ref<HTMLElement>}
          size={size}
          shape="circle"
          className={className}
          {...props}
        />
        {online !== undefined && online !== null && (
          <span
            aria-label={online ? 'Online' : 'Offline'}
            className={cn(
              'absolute bottom-0 right-0 rounded-full border-2 border-surface',
              online ? 'bg-success' : 'bg-muted-foreground',
              size === 'xs' && 'h-1.5 w-1.5',
              size === 'sm' && 'h-2 w-2',
              (size === 'md' || !size) && 'h-2.5 w-2.5',
              size === 'lg' && 'h-3 w-3',
              size === 'xl' && 'h-3.5 w-3.5',
            )}
          />
        )}
      </span>
    );
  },
);

/* ---------------------------------------------------------------------------
 * CompanyAvatar
 * ---------------------------------------------------------------------------
 * Square (rounded-md) avatar for organisations.
 * ------------------------------------------------------------------------- */

export type CompanyAvatarProps = AvatarProps;

export const CompanyAvatar = forwardRef<HTMLElement, CompanyAvatarProps>(
  function CompanyAvatar({ size = 'md', className, name, fallback, ...props }, ref) {
    const DerivedFallback = fallback ?? (name && name.length > 0 ? name[0]?.toUpperCase() ?? 'C' : 'C');

    return (
      <Avatar
        ref={ref as React.Ref<HTMLElement>}
        size={size}
        shape="rounded"
        name={name}
        fallback={DerivedFallback}
        className={cn('bg-secondary text-secondary-foreground', className)}
        {...props}
      />
    );
  },
);


/* ---------------------------------------------------------------------------
 * VehicleAvatar
 * ---------------------------------------------------------------------------
 * Truck icon in a teal square — consistent vehicle identity across all modules.
 * ------------------------------------------------------------------------- */

export interface VehicleAvatarProps extends HTMLAttributes<HTMLDivElement> {
  /** Vehicle plate or name — shown as tooltip title. */
  label?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

const vehicleSizeClasses: Record<string, string> = {
  xs: 'h-6 w-6',
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
  lg: 'h-11 w-11',
};

const vehicleIconClasses: Record<string, string> = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

export function VehicleAvatar({ label, size = 'md', className, ...props }: VehicleAvatarProps) {
  return (
    <div
      title={label}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary',
        vehicleSizeClasses[size],
        className,
      )}
      {...props}
    >
      <Truck className={vehicleIconClasses[size]} />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * DocumentAvatar
 * ---------------------------------------------------------------------------
 * File-type icon with colour-coded background by extension.
 * pdf=red, xlsx/csv=green, doc/docx=blue, image=amber, other=muted.
 * ------------------------------------------------------------------------- */

export interface DocumentAvatarProps extends HTMLAttributes<HTMLDivElement> {
  /** File extension or MIME type hint (pdf, xlsx, jpg, etc.). */
  type?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

function getDocStyle(type?: string): { bg: string; text: string; icon: ReactNode } {
  const ext = (type ?? '').toLowerCase().replace('.', '');
  if (['pdf'].includes(ext)) return { bg: 'bg-destructive-subtle', text: 'text-destructive', icon: <FileText /> };
  if (['xlsx', 'xls', 'csv'].includes(ext)) return { bg: 'bg-success-subtle', text: 'text-success', icon: <FileSpreadsheet /> };
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return { bg: 'bg-warning-subtle', text: 'text-warning', icon: <Image /> };
  return { bg: 'bg-info-subtle', text: 'text-info', icon: <FileText /> };
}

export function DocumentAvatar({ type, size = 'md', className, ...props }: DocumentAvatarProps) {
  const { bg, text, icon } = getDocStyle(type);
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md [&_svg]:h-4 [&_svg]:w-4',
        bg, text,
        vehicleSizeClasses[size],
        className,
      )}
      {...props}
    >
      {icon}
    </div>
  );
}
