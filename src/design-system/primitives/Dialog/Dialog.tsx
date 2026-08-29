import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react';

import { cn } from '@/utils';
import { CloseButton } from '../Button/CloseButton';

/**
 * Dialog — a centred modal built on Radix Dialog.
 *
 * The design system already had `Sheet`, which is the same Radix primitive
 * anchored to an edge. That is the right shape for a drawer of detail beside
 * the page, and the wrong shape for a decision: a confirmation that slides in
 * from the right leaves the thing being confirmed half-visible behind it, and
 * the eye keeps going back to it. A decision wants the page to stop.
 *
 * So this is `Sheet`'s twin, not its replacement — same accessibility contract
 * (focus trap, scroll lock, escape, `aria-modal`), same overlay token, same one
 * `CloseButton` — centred, and scrollable at small heights so a long body never
 * pushes its own footer off the screen.
 *
 * Every dialog needs a `DialogTitle` for screen readers. When the design calls
 * for a custom header, pass the title through `DialogHeader`'s `title` prop or
 * render a visually-hidden `DialogTitle` yourself; Radix warns loudly if none
 * is present, and that warning is correct.
 */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        'fixed inset-0 z-overlay bg-overlay backdrop-blur-[2px]',
        'data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out',
        className,
      )}
      {...props}
    />
  );
});

const dialogVariants = cva(
  [
    'relative z-drawer flex w-full flex-col border border-border bg-surface shadow-lg',
    'rounded-card',
    'data-[state=open]:animate-zoom-in data-[state=closed]:animate-zoom-out',
  ],
  {
    variants: {
      size: {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-2xl',
        xl: 'max-w-3xl',
        full: 'max-w-5xl',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

export interface DialogContentProps
  extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof dialogVariants> {
  /** Hides the built-in close button when the panel provides its own. */
  hideCloseButton?: boolean;
}

/**
 * The panel.
 *
 * The scroll container is the panel itself, not its positioner — which lets a
 * tall dialog scroll as one unit (header, body and footer together) into view
 * on a short screen, instead of trapping the overflow in a body the footer
 * sits below.
 *
 * That scroll has to live on `Content` and not its wrapper. Radix's built-in
 * scroll lock (`react-remove-scroll`, mounted on `DialogPrimitive.Content`)
 * only treats wheel/touch targets *inside* Content's own subtree as unlocked;
 * a scrollable ancestor sitting outside it — Content's positioner, where this
 * class used to live — is invisible to that allowlist, so every wheel event
 * over it came back `defaultPrevented`, and a dialog taller than the viewport
 * simply stopped moving once its content grew past one screen. Capping height
 * and scrolling here, on the node the lock actually recognises, is what makes
 * the wheel work again.
 */
export const DialogContent = forwardRef<ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  function DialogContent({ size, className, children, hideCloseButton = false, ...props }, ref) {
    return (
      <DialogPortal>
        <DialogOverlay />
        <div className="fixed inset-0 z-drawer flex items-start justify-center p-4 sm:p-6 lg:p-10">
          <DialogPrimitive.Content
            ref={ref}
            className={cn(
              dialogVariants({ size }),
              'my-auto max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-h-[calc(100vh-3rem)] lg:max-h-[calc(100vh-5rem)]',
              className,
            )}
            {...props}
          >
            {children}
            {!hideCloseButton && (
              /* The app's one close control, so a dialog dismisses the same way
                 as every panel that draws its own. */
              <DialogPrimitive.Close asChild>
                <CloseButton className="absolute right-4 top-4" />
              </DialogPrimitive.Close>
            )}
          </DialogPrimitive.Content>
        </div>
      </DialogPortal>
    );
  },
);

export const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('text-base font-semibold text-foreground', className)}
      {...props}
    />
  );
});

export const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
});

export interface DialogHeaderProps {
  /** The accessible title. Always rendered as a real `DialogTitle`. */
  title: ReactNode;
  /** One line under it, or a row of chips. */
  children?: ReactNode;
  className?: string;
}

/** Title, optional subtitle row, and the space the close button sits in. */
export function DialogHeader({ title, children, className }: DialogHeaderProps) {
  return (
    <div className={cn('border-b border-border-subtle px-5 py-4 pr-14 sm:px-6', className)}>
      <DialogTitle>{title}</DialogTitle>
      {children ? <div className="mt-1.5">{children}</div> : null}
    </div>
  );
}

export interface DialogBodyProps {
  children: ReactNode;
  className?: string;
}

export function DialogBody({ children, className }: DialogBodyProps) {
  return <div className={cn('px-5 py-4 sm:px-6', className)}>{children}</div>;
}

export interface DialogFooterProps {
  children: ReactNode;
  className?: string;
}

/** Actions, right-aligned on anything wider than a phone. */
export function DialogFooter({ children, className }: DialogFooterProps) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 border-t border-border-subtle px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6',
        className,
      )}
    >
      {children}
    </div>
  );
}
