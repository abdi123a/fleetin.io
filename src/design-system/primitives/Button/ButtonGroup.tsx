import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from '@/utils';

/**
 * ButtonGroup — buttons presented as one control.
 *
 * Two arrangements:
 *   - `attached` (default) joins buttons into a segmented control, collapsing
 *     the seam between neighbours and rounding only the outer corners
 *   - `spaced` keeps them separate, for a toolbar or a dialog footer
 *
 * The corner and border handling is done with CSS sibling selectors rather than
 * by cloning children with extra props, so the group works with any button —
 * including one wrapped in a `Tooltip` or a `DropdownMenuTrigger`, where cloning
 * would hit the wrapper instead of the button.
 *
 * @example
 * <ButtonGroup attached>
 *   <Button variant="outline">Day</Button>
 *   <Button variant="outline">Week</Button>
 * </ButtonGroup>
 */

export interface ButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** Joins the buttons into a segmented control. Defaults to true. */
  attached?: boolean;
  orientation?: 'horizontal' | 'vertical';
  /** Gap between buttons when not attached. */
  spacing?: 'sm' | 'md';
  /**
   * Semantics of the group.
   * `group` is right for a set of related actions; `toolbar` for a bar of
   * controls, which gives arrow-key navigation in most screen readers.
   */
  role?: 'group' | 'toolbar';
  /** Accessible name — always label a group of controls. */
  'aria-label'?: string;
}

export const ButtonGroup = forwardRef<HTMLDivElement, ButtonGroupProps>(function ButtonGroup(
  {
    className,
    attached = true,
    orientation = 'horizontal',
    spacing = 'md',
    role = 'group',
    children,
    ...props
  },
  ref,
) {
  const isHorizontal = orientation === 'horizontal';

  return (
    <div
      ref={ref}
      role={role}
      aria-orientation={role === 'toolbar' ? orientation : undefined}
      className={cn(
        'inline-flex',
        isHorizontal ? 'flex-row items-center' : 'flex-col items-stretch',

        !attached && (spacing === 'sm' ? 'gap-1.5' : 'gap-2'),

        attached && [
          // Only the outer corners stay rounded.
          isHorizontal
            ? '[&>*:not(:first-child)]:rounded-l-none [&>*:not(:last-child)]:rounded-r-none'
            : '[&>*:not(:first-child)]:rounded-t-none [&>*:not(:last-child)]:rounded-b-none',

          // Collapse the shared border so the seam is one line, not two.
          isHorizontal ? '[&>*:not(:first-child)]:-ml-px' : '[&>*:not(:first-child)]:-mt-px',

          // A focused or hovered segment must paint above its neighbours,
          // otherwise the ring is clipped by the next button's edge.
          '[&>*]:relative [&>*:focus-visible]:z-raised [&>*:hover]:z-raised',
        ],

        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});

/**
 * Vertical rule for separating clusters inside a toolbar.
 *
 * Rendered `aria-hidden`: it is a visual grouping cue, and announcing it would
 * add noise to a control the user is trying to operate.
 */
export function ButtonGroupSeparator({ className }: { className?: string }) {
  return <div aria-hidden className={cn('mx-1 h-5 w-px shrink-0 bg-border', className)} />;
}
