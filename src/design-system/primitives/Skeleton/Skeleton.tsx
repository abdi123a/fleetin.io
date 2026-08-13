import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';

import { cn } from '@/utils';

/**
 * Skeleton — loading placeholder.
 *
 * Marked `aria-hidden` with `role="presentation"`: the loading state is
 * announced by the container's `aria-busy`, not by the placeholder shapes.
 */

const skeletonVariants = cva('bg-muted', {
  variants: {
    variant: {
      shimmer: [
        'animate-shimmer bg-[length:200%_100%]',
        'bg-[linear-gradient(90deg,var(--muted)_0%,var(--surface-raised)_50%,var(--muted)_100%)]',
      ],
      pulse: 'animate-pulse motion-reduce:animate-none',
      static: '',
    },
    shape: {
      text: 'h-4 rounded-sm',
      block: 'rounded-md',
      circle: 'rounded-full',
    },
  },
  defaultVariants: {
    variant: 'shimmer',
    shape: 'block',
  },
});

export interface SkeletonProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof skeletonVariants> {}

export function Skeleton({ className, variant, shape, ...props }: SkeletonProps) {
  return (
    <div
      role="presentation"
      aria-hidden
      className={cn(skeletonVariants({ variant, shape }), className)}
      {...props}
    />
  );
}

export { skeletonVariants };
