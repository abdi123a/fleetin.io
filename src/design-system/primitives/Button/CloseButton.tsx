import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { X } from '@/design-system/icons';
import { cn } from '@/utils';

/**
 * The app's close control — one shape for every panel, sheet and modal.
 *
 * A bordered square rather than a bare glyph, deliberately: a naked X sitting
 * on a busy header reads as decoration and is a small target to hit. The frame
 * gives it an edge to aim at and marks it as the one way out of the panel.
 *
 * Every dismiss affordance in the product should be this, so that "close" looks
 * the same wherever a reader meets it — the sheets got there via
 * `SheetContent`'s built-in button, which now renders this too.
 */
export interface CloseButtonProps extends ComponentPropsWithoutRef<'button'> {
  /** Accessible name. Defaults to "Close". */
  label?: string;
}

export const CloseButton = forwardRef<HTMLButtonElement, CloseButtonProps>(
  function CloseButton({ className, label = 'Close', ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        className={cn(
          'shrink-0 cursor-pointer rounded-lg border border-border/80 bg-background p-2',
          'text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          className,
        )}
        {...props}
      >
        <X className="h-4 w-4" />
      </button>
    );
  },
);
