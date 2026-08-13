import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react';

import { cn } from '@/utils';

/**
 * Tooltip — Radix primitive with FLEETIN styling.
 *
 * Exposes both the composable Radix parts and a `Tooltip` convenience wrapper,
 * which is what most call sites want (a trigger plus a string of content).
 * `TooltipProvider` is mounted once in `AppProviders`.
 */

export const TooltipProvider = TooltipPrimitive.Provider;
export const TooltipRoot = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = forwardRef<
  ElementRef<typeof TooltipPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function TooltipContent({ className, sideOffset = 8, children, ...props }, ref) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-tooltip max-w-64 rounded-md border border-border bg-popover px-2.5 py-1.5',
          'text-xs font-medium text-popover-foreground shadow-md',
          'data-[state=delayed-open]:animate-zoom-in data-[state=closed]:animate-zoom-out',
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="fill-popover stroke-border" width={10} height={5} />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
});

export interface TooltipProps
  extends Pick<TooltipPrimitive.TooltipContentProps, 'side' | 'align' | 'sideOffset'> {
  /** Tooltip body. When omitted, the trigger renders with no tooltip attached. */
  content: ReactNode;
  children: ReactNode;
  /** Delay in ms before opening. Defaults to the provider's setting. */
  delayDuration?: number;
  /** Controlled open state; leave undefined for the default hover/focus behaviour. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Skips the wrapper entirely — useful when the tooltip is conditional. */
  disabled?: boolean;
}

export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  sideOffset,
  delayDuration,
  open,
  onOpenChange,
  disabled = false,
}: TooltipProps) {
  if (disabled || content === undefined || content === null || content === '') {
    return <>{children}</>;
  }

  return (
    <TooltipRoot delayDuration={delayDuration} open={open} onOpenChange={onOpenChange}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} align={align} sideOffset={sideOffset}>
        {content}
      </TooltipContent>
    </TooltipRoot>
  );
}
