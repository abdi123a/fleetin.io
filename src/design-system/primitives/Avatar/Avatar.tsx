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
  /**
   * How the image fills the frame. `cover` for a photograph of a person, which
   * survives a crop; `contain` for a company mark, which does not — a wordmark
   * cropped to a square reads as a different company.
   */
  fit?: 'cover' | 'contain';
}

export const Avatar = forwardRef<ElementRef<typeof AvatarPrimitive.Root>, AvatarProps>(
  function Avatar({ className, size, shape, src, name, fallback, fit = 'cover', ...props }, ref) {
    return (
      <AvatarPrimitive.Root
        ref={ref}
        className={cn(
          avatarVariants({ size, shape }),
          /* A company mark needs its own edge.
             Most supplied logos are artwork on white, so on a white card the
             frame vanished and the mark floated with no shape at all — you
             could not tell whether a logo was there or missing. The ring draws
             that edge — and it is `border-strong`, not `border`: the plain rule
             is one step off the card surface and disappeared under exactly the
             white-on-white logos it exists for (the user flagged it on
             2026-08-29). `ring-inset`, because the frame clips its contents: an
             outset ring on a `rounded-full` avatar is cut off at the corners.
             Photographs (`cover`) carry their own edge and get none. */
          fit === 'contain' && 'ring-1 ring-inset ring-border-strong/80',
          className,
        )}
        {...props}
      >
        {src && (
          <AvatarPrimitive.Image
            src={src}
            alt={name ?? ''}
            className={cn(
              'size-full',
              fit === 'contain'
                ? cn(
                    /* The artwork sits on the frame's own surface, not the
                       fallback's grey chip. Supplied logos are mostly opaque
                       white squares, and letterboxing one onto grey drew a
                       visible white square inside the circle — which is what
                       "the logo doesn't fit" actually was. */
                    'bg-card object-contain',
                    /* No inset. The artwork already carries one.
                       Every logo on file is squared and padded by
                       `normalise-logos.py` before upload — measured across all
                       17, the ink occupies 82.5–83.2% of the frame, i.e. a
                       consistent ~8.3% margin — and the generated SVG wordmarks
                       are deliberately full-bleed colour. Adding 12% on top of
                       that padded a padded image: the mark ended up filling
                       about 63% of the circle's width, which read as "the logo
                       doesn't fit its placeholder" at every size, and worse on
                       an SVG mark, where it drew a solid coloured square with
                       white corners inside a circle.
                       At `p-0` the ink lands at ~83% of the circle and the
                       artwork's own margin does the job the inset was invented
                       for. If a logo ever arrives unpadded it meets the rim
                       rather than overflowing it, because the frame clips. */
                    'p-0',
                  )
                : 'aspect-square object-cover',
            )}
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
