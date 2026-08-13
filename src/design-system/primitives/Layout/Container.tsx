import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from '@/utils';

/* ---------------------------------------------------------------------------
 * Container
 * ---------------------------------------------------------------------------
 * Constrains content to a max-width and centers it horizontally with
 * consistent horizontal padding. Future modules should always wrap page
 * content in a Container rather than writing their own mx-auto + max-w.
 * ------------------------------------------------------------------------- */

const containerVariants = cva('w-full mx-auto px-4 sm:px-6', {
  variants: {
    size: {
      /** 640 px — for narrow single-column content like auth forms or articles */
      narrow: 'max-w-xl',
      /** 768 px — forms, dialogs, detail panels */
      sm: 'max-w-3xl',
      /** 1024 px — most internal pages */
      default: 'max-w-5xl',
      /** 1280 px — dashboards and data-heavy pages */
      wide: 'max-w-6xl',
      /** 1536 px — analytics and full-width layouts */
      xl: 'max-w-screen-2xl',
      /** No max-width constraint */
      full: 'max-w-none',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

export interface ContainerProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof containerVariants> {}

export const Container = forwardRef<HTMLDivElement, ContainerProps>(function Container(
  { size, className, children, ...props },
  ref,
) {
  return (
    <div ref={ref} className={cn(containerVariants({ size }), className)} {...props}>
      {children}
    </div>
  );
});
