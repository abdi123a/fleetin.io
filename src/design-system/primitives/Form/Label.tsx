import * as RadixLabel from '@radix-ui/react-label';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';


import { cn } from '@/utils';

import { useFormField } from './FormContext';
import { RequiredIndicator } from './RequiredIndicator';

export interface LabelProps extends ComponentPropsWithoutRef<typeof RadixLabel.Root> {
  /** Mark as required. If undefined, reads from FormField context. */
  required?: boolean;
  /** Mark as optional (shows "(optional)" badge/subtext). */
  optional?: boolean;
  /** Custom required indicator node or false to disable. */
  showRequiredIndicator?: boolean;
}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(function Label(
  { className, children, required: requiredProp, optional: optionalProp, showRequiredIndicator = true, htmlFor, id, ...props },
  ref,
) {

  const { formLabelId, formItemId, required: contextRequired, optional: contextOptional, disabled } = useFormField();

  const isRequired = requiredProp ?? contextRequired;
  const isOptional = optionalProp ?? contextOptional;
  const targetId = htmlFor ?? formItemId;
  const labelId = id ?? formLabelId;

  return (
    <RadixLabel.Root
      ref={ref}
      id={labelId}

      htmlFor={targetId}
      className={cn(
        'inline-flex items-center gap-1.5 type-body-sm font-medium text-foreground select-none',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      {isRequired && showRequiredIndicator && <RequiredIndicator />}
      {isOptional && !isRequired && (
        <span className="type-body-xs font-normal text-muted-foreground">(optional)</span>
      )}
    </RadixLabel.Root>
  );
});
