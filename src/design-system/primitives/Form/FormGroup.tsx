import { forwardRef, type FieldsetHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/utils';

export interface FormGroupProps extends FieldsetHTMLAttributes<HTMLFieldSetElement> {
  /** Optional legend title for the fieldset group. */
  legend?: ReactNode;
  /** Optional description for the group. */
  description?: ReactNode;
  /** Layout direction for group children. Default is 'vertical'. */
  orientation?: 'vertical' | 'horizontal';
}

export const FormGroup = forwardRef<HTMLFieldSetElement, FormGroupProps>(function FormGroup(
  { legend, description, orientation = 'vertical', className, children, disabled, ...props },
  ref,
) {
  return (
    <fieldset
      ref={ref}
      disabled={disabled}
      className={cn('m-0 border-none p-0 min-w-0', className)}
      {...props}
    >
      {(legend || description) && (
        <div className="mb-3 space-y-1">
          {legend && (
            <legend className="p-0 type-body-sm text-foreground">
              {legend}
            </legend>
          )}
          {description && (
            <p className="type-body-xs text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      <div
        className={cn(
          orientation === 'vertical' ? 'space-y-3' : 'flex flex-wrap items-center gap-4',
        )}
      >
        {children}
      </div>
    </fieldset>
  );
});
