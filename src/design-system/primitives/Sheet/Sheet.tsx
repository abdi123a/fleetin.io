import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';

import { cn } from '@/utils';
import { CloseButton } from '../Button/CloseButton';

/**
 * Sheet — an edge-anchored overlay panel built on Radix Dialog.
 *
 * Carries the full dialog accessibility contract (focus trap, scroll lock,
 * escape handling, `aria-modal`). Used by the shell for the mobile navigation
 * drawer, and available to features for slide-over detail panels.
 */

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetPortal = DialogPrimitive.Portal;

export const SheetOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function SheetOverlay({ className, ...props }, ref) {
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

const sheetVariants = cva(
  [
    'fixed z-drawer flex flex-col gap-4 bg-surface shadow-lg',
    'transition ease-emphasized',
  ],
  {
    variants: {
      side: {
        left: 'inset-y-0 left-0 h-full w-3/4 max-w-sm border-r data-[state=open]:animate-slide-in-left data-[state=closed]:animate-slide-out-left',
        /* `sm:max-w-md` is the house width for a side panel — what Create
           Shipment opens at, and what the user asked every side popup to match
           on 2026-08-30. It lives here rather than being retyped at each call
           site so a new sheet inherits it; a panel that genuinely needs more
           room (a BI drill-down, the document viewer) still says so in its own
           className, which twMerge lets win. */
        right:
          'inset-y-0 right-0 h-full w-full sm:max-w-md border-l data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out',
        top: 'inset-x-0 top-0 border-b data-[state=open]:animate-slide-in-top data-[state=closed]:animate-fade-out',
        bottom: 'inset-x-0 bottom-0 border-t data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out',
      },
    },
    defaultVariants: {
      side: 'left',
    },
  },
);

export interface SheetContentProps
  extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /** Hides the built-in close button when the panel provides its own. */
  hideCloseButton?: boolean;
}

export const SheetContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(function SheetContent({ side, className, children, hideCloseButton = false, ...props }, ref) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(sheetVariants({ side }), className)}
        {...props}
      >
        {children}
        {!hideCloseButton && (
          /* The app's one close control (`CloseButton`), so a sheet dismisses
             the same way as every panel that draws its own. */
          <DialogPrimitive.Close asChild>
            <CloseButton className="absolute right-4 top-4" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </SheetPortal>
  );
});

export const SheetTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function SheetTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('text-lg font-semibold text-foreground', className)}
      {...props}
    />
  );
});

export const SheetDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function SheetDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
});
