import { type HTMLAttributes } from 'react';

import { Skeleton } from '@/design-system/primitives/Skeleton';
import { cn } from '@/utils';

/* ---------------------------------------------------------------------------
 * CardSkeleton
 * ------------------------------------------------------------------------- */

export interface CardSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Show header area. Default true. */
  header?: boolean;
  /** Show footer area. Default false. */
  footer?: boolean;
  /** Number of content rows. Default 3. */
  rows?: number;
}

export function CardSkeleton({
  header = true,
  footer = false,
  rows = 3,
  className,
  ...props
}: CardSkeletonProps) {
  return (
    <div
      className={cn('rounded-lg border border-border bg-surface shadow-elevation-xs', className)}
      role="presentation"
      aria-hidden
      {...props}
    >
      {header && (
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-3.5 w-52" shape="text" />
          </div>
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      )}
      <div className="space-y-3 px-5 py-4">
        {Array.from({ length: rows }, (_, i) => `row-${i}`).map((k, idx) => (
          <Skeleton
            key={k}
            className="h-4 rounded-sm"
            style={{ width: `${100 - idx * 12}%` }}
            shape="text"
          />
        ))}
      </div>
      {footer && (
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <Skeleton className="h-8 w-16 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * ListSkeleton
 * ------------------------------------------------------------------------- */

export interface ListSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Number of list item rows. Default 5. */
  rows?: number;
  /** Show leading avatar/icon. Default false. */
  avatar?: boolean;
}

export function ListSkeleton({ rows = 5, avatar = false, className, ...props }: ListSkeletonProps) {
  return (
    <div
      className={cn('divide-y divide-border rounded-lg border border-border bg-surface', className)}
      role="presentation"
      aria-hidden
      {...props}
    >
      {Array.from({ length: rows }, (_, i) => `item-${i}`).map((k) => (
        <div key={k} className="flex items-center gap-3 px-4 py-3">
          {avatar && <Skeleton className="h-9 w-9 shrink-0" shape="circle" />}
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40" shape="text" />
            <Skeleton className="h-3 w-64" shape="text" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * PageSkeleton
 * ------------------------------------------------------------------------- */

export interface PageSkeletonProps extends HTMLAttributes<HTMLDivElement> {}

export function PageSkeleton({ className, ...props }: PageSkeletonProps) {
  return (
    <div className={cn('space-y-6', className)} role="presentation" aria-hidden {...props}>
      {/* Page header */}
      <div className="space-y-2">
        <Skeleton className="h-3.5 w-32" shape="text" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" shape="text" />
      </div>
      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {['s1', 's2', 's3', 's4'].map((k) => (
          <div key={k} className="rounded-lg border border-border bg-surface p-5 space-y-4">
            <div className="flex items-start justify-between">
              <Skeleton className="h-4 w-24" shape="text" />
              <Skeleton className="h-9 w-9 rounded-md" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-32" shape="text" />
            </div>
          </div>
        ))}
      </div>
      {/* Main content area */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CardSkeleton rows={6} header footer />
        </div>
        <div>
          <CardSkeleton rows={4} />
        </div>
      </div>
    </div>
  );
}
