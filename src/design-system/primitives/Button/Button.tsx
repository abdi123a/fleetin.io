import { Slot, Slottable } from '@radix-ui/react-slot';
import { Loader2 } from '@/design-system/icons';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/utils';

import { buttonVariants, type ButtonVariantProps } from './buttonVariants';

/**
 * Button — the only button implementation in the application.
 *
 * Every clickable action goes through this component. Modules must not define
 * their own button: if a need is not expressible here, the component gains a
 * variant rather than the feature gaining a bespoke control.
 *
 * Accessibility contract:
 *   - renders a real `<button>`, so Enter/Space and form semantics come free
 *   - `asChild` swaps the element (typically a router `<Link>`) while keeping
 *     the styling; the child then owns its own native semantics
 *   - the focus ring is part of the base styles and cannot be opted out of
 *   - `isLoading` marks the control `aria-busy` and blocks interaction, so a
 *     submit cannot be fired twice
 *   - icon-only buttons require an accessible name — use `IconButton`, which
 *     enforces it at the type level
 *
 * @example
 * <Button variant="primary" leadingIcon={<Plus />}>Create shipment</Button>
 * <Button asChild variant="ghost"><Link to="/partners">All partners</Link></Button>
 * <Button variant="destructive" isLoading loadingText="Deleting…">Delete</Button>
 */

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'>,
    Omit<ButtonVariantProps, 'iconOnly'> {
  /**
   * Renders the child element with button styling instead of a `<button>`.
   * The child must be a single React element.
   */
  asChild?: boolean;

  /** Shows a spinner, blocks interaction and marks the control busy. */
  isLoading?: boolean;

  /**
   * Replaces the label while loading, e.g. "Saving…".
   * Prefer this over changing `children` yourself so the button keeps a stable
   * accessible name for the duration of the action.
   */
  loadingText?: ReactNode;

  /** Icon before the label. Replaced by the spinner while loading. */
  leadingIcon?: ReactNode;

  /** Icon after the label. */
  trailingIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    shape,
    fullWidth,
    asChild = false,
    isLoading = false,
    loadingText,
    leadingIcon,
    trailingIcon,
    disabled,
    type,
    children,
    ...props
  },
  ref,
) {
  const Component = asChild ? Slot : 'button';
  const isDisabled = disabled === true || isLoading;

  return (
    <Component
      ref={ref}
      // `iconOnly` is intentionally not forwarded: a labelled button is never
      // square, and `size="icon"` already carries the square metrics.
      className={cn(buttonVariants({ variant, size, shape, fullWidth }), className)}
      // An anchor rendered via asChild silently ignores `disabled`, so the
      // state is also expressed with aria-disabled, which the styles key off.
      disabled={asChild ? undefined : isDisabled}
      aria-disabled={asChild && isDisabled ? true : undefined}
      aria-busy={isLoading || undefined}
      // Styling and test hook for the busy state.
      data-loading={isLoading || undefined}
      // Buttons inside a form default to `submit` in HTML, which fires
      // unintended submissions. Opt in explicitly instead.
      type={asChild ? undefined : (type ?? 'button')}
      {...props}
    >
      {isLoading ? <Loader2 className="animate-spin" aria-hidden /> : leadingIcon}

      {/* Slottable marks which child receives the merged props; without it,
          Slot rejects the three-child structure even when both icons are
          undefined. */}
      <Slottable>{isLoading && loadingText ? loadingText : children}</Slottable>

      {!isLoading && trailingIcon}
    </Component>
  );
});

export { buttonVariants };
