import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';

import { cn } from '@/utils';

/**
 * Collapsible — animated show/hide region.
 *
 * The height animation is driven by Radix's `--radix-collapsible-content-height`
 * custom property, consumed by the `collapsible-down`/`collapsible-up` keyframes.
 */

export const Collapsible = CollapsiblePrimitive.Root;
export const CollapsibleTrigger = CollapsiblePrimitive.Trigger;

export const CollapsibleContent = forwardRef<
  ElementRef<typeof CollapsiblePrimitive.Content>,
  ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Content>
>(function CollapsibleContent({ className, children, ...props }, ref) {
  return (
    <CollapsiblePrimitive.Content
      ref={ref}
      className={cn(
        'overflow-hidden',
        'data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up',
        className,
      )}
      {...props}
    >
      {children}
    </CollapsiblePrimitive.Content>
  );
});
