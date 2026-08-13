import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from '@/utils';

export interface FormActionsProps extends HTMLAttributes<HTMLDivElement> {
  /** Layout alignment of action buttons. Default is 'right'. */
  align?: 'left' | 'right' | 'between' | 'full';
  /** Stick actions bar to bottom of viewport/container. Default is false. */
  sticky?: boolean;
  /** Add a top divider border. Default is false. */
  bordered?: boolean;
}

export const FormActions = forwardRef<HTMLDivElement, FormActionsProps>(function FormActions(
  { align = 'right', sticky = false, bordered = false, className, children, ...props },
  ref,
) {
  const alignClasses = {
    left: 'justify-start',
    right: 'justify-end',
    between: 'justify-between',
    full: 'grid grid-cols-2 gap-3 sm:flex sm:justify-end',
  };

  return (
    <div
      ref={ref}
      className={cn(
        'flex items-center gap-3 pt-4',
        alignClasses[align],
        bordered && 'border-t border-border mt-6 pt-6',
        sticky && 'sticky bottom-0 z-10 bg-surface/95 backdrop-blur-sm py-4 border-t border-border shadow-elevation-1',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});
