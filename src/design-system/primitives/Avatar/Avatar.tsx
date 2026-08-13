import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';

import { cn } from '@/utils';
import { getInitials } from '@/utils';

/**
 * Avatar — image with an automatic initials fallback.
 *
 * The platform renders initials on a tinted square for accounts and a circle
 * for people, hence the `shape` variant.
 */

const avatarVariants = cva(
  'relative flex shrink-0 overflow-hidden select-none items-center justify-center bg-primary-subtle',
  {
    variants: {
      size: {
        xs: 'size-6 text-2xs',
        sm: 'size-8 text-xs',
        md: 'size-9 text-sm',
        lg: 'size-11 text-base',
        xl: 'size-14 text-lg',
      },
      shape: {
        circle: 'rounded-full',
        rounded: 'rounded-md',
      },
    },
    defaultVariants: {
      size: 'md',
      shape: 'circle',
    },
  },
);

export interface AvatarProps
  extends ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>,
    VariantProps<typeof avatarVariants> {
  src?: string;
  /** Used for the `alt` text and to derive the initials fallback. */
  name?: string;
  /** Overrides the initials derived from `name`. */
  fallback?: string;
}

export const Avatar = forwardRef<ElementRef<typeof AvatarPrimitive.Root>, AvatarProps>(
  function Avatar({ className, size, shape, src, name, fallback, ...props }, ref) {
    return (
      <AvatarPrimitive.Root
        ref={ref}
        className={cn(avatarVariants({ size, shape }), className)}
        {...props}
      >
        {src && (
          <AvatarPrimitive.Image
            src={src}
            alt={name ?? ''}
            className="aspect-square size-full object-cover"
          />
        )}
        <AvatarPrimitive.Fallback
          delayMs={src ? 300 : 0}
          className="flex size-full items-center justify-center font-semibold text-primary-subtle-foreground"
        >
          {fallback ?? getInitials(name, 2, '?')}
        </AvatarPrimitive.Fallback>
      </AvatarPrimitive.Root>
    );
  },
);

export { avatarVariants };
