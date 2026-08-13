import { CheckCircle2 } from '@/design-system/icons';

import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from '@/utils';

import { useFormField } from './FormContext';

export interface SuccessMessageProps extends HTMLAttributes<HTMLParagraphElement> {
  /** Custom success message. Reads from FormField context if omitted. */
  message?: string | boolean;
  /** Hide check icon. Defaults to false. */
  hideIcon?: boolean;
}

export const SuccessMessage = forwardRef<HTMLParagraphElement, SuccessMessageProps>(
  function SuccessMessage({ message: messageProp, hideIcon = false, className, children, id, ...props }, ref) {
    const { formSuccessId, success: contextSuccess } = useFormField();
    const targetId = id ?? formSuccessId;

    const rawSuccess = messageProp ?? contextSuccess;
    const displayMessage =
      typeof children === 'string'
        ? children
        : typeof rawSuccess === 'string'
          ? rawSuccess
          : undefined;

    if (!rawSuccess) return null;

    return (
      <p
        ref={ref}
        id={targetId}
        aria-live="polite"
        className={cn('flex items-center gap-1.5 type-body-xs font-medium text-success', className)}
        {...props}
      >
        {!hideIcon && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        <span>{children ?? displayMessage ?? 'Validated'}</span>
      </p>
    );
  },
);
