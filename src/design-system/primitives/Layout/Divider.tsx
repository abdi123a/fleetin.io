import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/utils';

/* ---------------------------------------------------------------------------
 * Divider
 * ---------------------------------------------------------------------------
 * Renders a semantic <hr> (horizontal) or a <div> (vertical) separator.
 * Supports inset spacing, a label in the centre, and style variants.
 * ------------------------------------------------------------------------- */

export interface DividerProps extends HTMLAttributes<HTMLElement> {
  /** Orientation. Default 'horizontal'. */
  orientation?: 'horizontal' | 'vertical';
  /** Line style. Default 'solid'. */
  variant?: 'solid' | 'dashed' | 'dotted';
  /** Optional label centred on the line. */
  label?: ReactNode;
  /** Shrinks the line so it doesn't reach the edges of its container. */
  inset?: boolean;
}

const variantClasses: Record<string, string> = {
  solid: 'border-solid',
  dashed: 'border-dashed',
  dotted: 'border-dotted',
};

export const Divider = forwardRef<HTMLElement, DividerProps>(function Divider(
  { orientation = 'horizontal', variant = 'solid', label, inset = false, className, ...props },
  ref,
) {
  if (orientation === 'vertical') {
    return (
      <div
        ref={ref as React.Ref<HTMLDivElement>}
        role="separator"
        aria-orientation="vertical"
        className={cn(
          'inline-block w-px self-stretch border-l border-border',
          variantClasses[variant],
          inset && 'my-2',
          className,
        )}
        {...(props as HTMLAttributes<HTMLDivElement>)}
      />
    );
  }

  if (label) {
    return (
      <div
        ref={ref as React.Ref<HTMLDivElement>}
        role="separator"
        aria-orientation="horizontal"
        className={cn('flex items-center gap-3', inset && 'mx-4', className)}
        {...(props as HTMLAttributes<HTMLDivElement>)}
      >
        <div className={cn('h-px flex-1 border-t border-border', variantClasses[variant])} />
        <span className="type-body-xs font-medium text-muted-foreground shrink-0">{label}</span>
        <div className={cn('h-px flex-1 border-t border-border', variantClasses[variant])} />
      </div>
    );
  }

  return (
    <hr
      ref={ref as React.Ref<HTMLHRElement>}
      className={cn(
        'border-0 border-t border-border',
        variantClasses[variant],
        inset && 'mx-4',
        className,
      )}
      {...(props as HTMLAttributes<HTMLHRElement>)}
    />
  );
});
