import { Slot } from '@radix-ui/react-slot';
import { Loader2 } from '@/design-system/icons';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/utils';

import { buttonVariants, type ButtonVariantProps } from './buttonVariants';

/**
 * IconButton — a square, icon-only button.
 *
 * Not a second button implementation: it renders from the same `buttonVariants`
 * as `Button`, so the two can never diverge visually. It exists for one reason
 * the type system can enforce — `aria-label` is **required**. An icon-only
 * control with no accessible name is invisible to a screen reader, and that is
 * a defect the compiler should catch rather than an audit.
 *
 * @example
 * <IconButton aria-label="Delete shipment" variant="ghost"><Trash2 /></IconButton>
 * <IconButton aria-label="Refresh" size="sm" isLoading />
 */

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color' | 'children'>,
    Omit<ButtonVariantProps, 'iconOnly' | 'fullWidth'> {
  /** Accessible name. Required — there is no visible label to fall back on. */
  'aria-label': string;

  /** The icon to render. */
  children?: ReactNode;

  /** Alternative to `children`, for call sites that pass the icon as a prop. */
  icon?: ReactNode;

  asChild?: boolean;

  /** Replaces the icon with a spinner and blocks interaction. */
  isLoading?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    className,
    variant = 'ghost',
    size = 'md',
    shape,
    asChild = false,
    isLoading = false,
    icon,
    children,
    disabled,
    type,
    ...props
  },
  ref,
) {
  const Component = asChild ? Slot : 'button';
  const isDisabled = disabled === true || isLoading;

  // `size="icon"` is already square; anything on the xs–xl scale is squared by
  // the `iconOnly` compound variants.
  const isScaleSize = size !== 'icon';

  return (
    <Component
      ref={ref}
      className={cn(
        buttonVariants({ variant, size, shape, iconOnly: isScaleSize }),
        className,
      )}
      disabled={asChild ? undefined : isDisabled}
      aria-disabled={asChild && isDisabled ? true : undefined}
      aria-busy={isLoading || undefined}
      data-loading={isLoading || undefined}
      type={asChild ? undefined : (type ?? 'button')}
      {...props}
    >
      {isLoading ? <Loader2 className="animate-spin" aria-hidden /> : (icon ?? children)}
    </Component>
  );
});
