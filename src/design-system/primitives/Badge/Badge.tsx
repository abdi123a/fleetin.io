import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from '@/utils';

/**
 * Badge — compact status pill.
 *
 * `solid` matches the platform's status chips (Created, Dispatch started,
 * Verified); `subtle` is the low-emphasis form for dense layouts.
 *
 * Intents map onto semantic tokens, so a badge never encodes a business
 * status directly — the feature decides which intent a status maps to.
 */

const badgeVariants = cva(
  [
    'inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-medium',
    "[&_svg]:size-3 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        solid: 'border-transparent',
        subtle: 'border-transparent',
        outline: 'bg-transparent',
      },
      intent: {
        default: '',
        primary: '',
        accent: '',
        success: '',
        /* The later rung of a phase, not a new phase — see `--success-deep`.
           A badge used to fold these back onto `success`/`warning`, so a
           booking at "Delivered" wore the same green as one at "Picked Up"
           while the picker beside it drew them a step apart. One rung cannot
           be two colours on one screen. */
        'success-deep': '',
        warning: '',
        'warning-deep': '',
        destructive: '',
        info: '',
      },
      size: {
        sm: 'px-2 py-0.5 text-2xs',
        md: 'px-2.5 py-0.5 text-xs',
        lg: 'px-3 py-1 text-sm',
      },
    },
    compoundVariants: [
      // Solid
      { variant: 'solid', intent: 'default', class: 'bg-secondary text-secondary-foreground' },
      { variant: 'solid', intent: 'primary', class: 'bg-primary text-primary-foreground' },
      { variant: 'solid', intent: 'accent', class: 'bg-accent text-accent-foreground' },
      { variant: 'solid', intent: 'success', class: 'bg-success text-success-foreground' },
      { variant: 'solid', intent: 'success-deep', class: 'bg-success-deep text-success-deep-foreground' },
      { variant: 'solid', intent: 'warning', class: 'bg-warning text-warning-foreground' },
      { variant: 'solid', intent: 'warning-deep', class: 'bg-warning-deep text-warning-deep-foreground' },
      { variant: 'solid', intent: 'destructive', class: 'bg-destructive text-destructive-foreground' },
      { variant: 'solid', intent: 'info', class: 'bg-info text-info-foreground' },
      // Subtle
      { variant: 'subtle', intent: 'default', class: 'bg-muted text-muted-foreground' },
      { variant: 'subtle', intent: 'primary', class: 'bg-primary-subtle text-primary-subtle-foreground' },
      { variant: 'subtle', intent: 'accent', class: 'bg-accent-subtle text-accent-subtle-foreground' },
      { variant: 'subtle', intent: 'success', class: 'bg-success-subtle text-success-subtle-foreground' },
      /* The phase's own tint, ringed.
       *
       * Two washes of one hue side by side read as a rendering fault rather
       * than as a step, and the subtle foreground is *already* the deep colour
       * (`--warning-subtle-foreground` is orange-800), so tinting or
       * re-inking it would produce a chip identical to the plain one. The ring
       * is the step: quiet, and the only axis left that is not carrying
       * something else. */
      { variant: 'subtle', intent: 'success-deep', class: 'bg-success-subtle text-success-deep border-success-deep/35' },
      { variant: 'subtle', intent: 'warning', class: 'bg-warning-subtle text-warning-subtle-foreground' },
      { variant: 'subtle', intent: 'warning-deep', class: 'bg-warning-subtle text-warning-subtle-foreground border-warning-deep/35' },
      { variant: 'subtle', intent: 'destructive', class: 'bg-destructive-subtle text-destructive-subtle-foreground' },
      { variant: 'subtle', intent: 'info', class: 'bg-info-subtle text-info-subtle-foreground' },
      // Outline
      { variant: 'outline', intent: 'default', class: 'border-border-strong text-foreground' },
      { variant: 'outline', intent: 'primary', class: 'border-primary text-primary' },
      { variant: 'outline', intent: 'accent', class: 'border-accent text-accent' },
      { variant: 'outline', intent: 'success', class: 'border-success text-success' },
      { variant: 'outline', intent: 'success-deep', class: 'border-success-deep text-success-deep' },
      { variant: 'outline', intent: 'warning', class: 'border-warning text-warning' },
      { variant: 'outline', intent: 'warning-deep', class: 'border-warning-deep text-warning-deep' },
      { variant: 'outline', intent: 'destructive', class: 'border-destructive text-destructive' },
      { variant: 'outline', intent: 'info', class: 'border-info text-info' },
    ],
    defaultVariants: {
      variant: 'subtle',
      intent: 'default',
      size: 'md',
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  asChild?: boolean;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant, intent, size, asChild = false, ...props },
  ref,
) {
  const Component = asChild ? Slot : 'span';

  return (
    <Component
      ref={ref}
      className={cn(badgeVariants({ variant, intent, size }), className)}
      {...props}
    />
  );
});

export { badgeVariants };
