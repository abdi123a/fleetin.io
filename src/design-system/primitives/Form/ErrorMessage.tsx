import { AlertCircle } from '@/design-system/icons';

import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from '@/utils';

import { useFormField, getErrorMessage } from './FormContext';

export interface ErrorMessageProps extends HTMLAttributes<HTMLParagraphElement> {
  /** Custom error message. If not provided, reads error message from FormField context. */
  message?: string | boolean;
  /** Hide alert icon. Default is false (icon shown). */
  hideIcon?: boolean;
}

export const ErrorMessage = forwardRef<HTMLParagraphElement, ErrorMessageProps>(function ErrorMessage(
  { message: messageProp, hideIcon = false, className, children, id, ...props },
  ref,
) {
  const { formErrorId, error: contextError } = useFormField();
  const targetId = id ?? formErrorId;

  const rawError = messageProp ?? contextError;
  const displayMessage = typeof children === 'string' ? children : getErrorMessage(rawError);

  if (!displayMessage) return null;

  return (
    <p
      ref={ref}
      id={targetId}
      role="alert"
      aria-live="polite"
      className={cn('flex items-center gap-1.5 type-body-xs font-medium text-danger', className)}
      {...props}
    >
      {!hideIcon && <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      <span>{children ?? displayMessage}</span>
    </p>
  );
});
