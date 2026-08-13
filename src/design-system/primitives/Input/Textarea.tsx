import { forwardRef, type TextareaHTMLAttributes } from 'react';

import { useFormField } from '@/design-system/primitives/Form/FormContext';
import { cn } from '@/utils';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Size step of the textarea padding/font. Default is 'md'. */
  textareaSize?: 'sm' | 'md' | 'lg';
  /** Prevent manual user resizing. Default is false. */
  resizable?: boolean;
}

const sizeClasses = {
  sm: 'px-2.5 py-1.5 text-xs rounded-sm min-h-[4rem]',
  md: 'px-3 py-2 text-sm rounded-md min-h-[5rem]',
  lg: 'px-3.5 py-2.5 text-base rounded-md min-h-[6rem]',
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    textareaSize = 'md',
    resizable = true,
    className,
    disabled: propDisabled,
    readOnly: propReadOnly,
    id: propId,
    name: propName,
    ...props
  },
  ref,
) {
  const {
    id: contextId,
    name: contextName,
    ariaDescribedBy,
    error: contextError,
    success: contextSuccess,
    disabled: contextDisabled,
    readOnly: contextReadOnly,
  } = useFormField();

  const targetId = propId ?? contextId;
  const targetName = propName ?? contextName;
  const isDisabled = propDisabled ?? contextDisabled;
  const isReadOnly = propReadOnly ?? contextReadOnly;
  const isError = Boolean(contextError);
  const isSuccess = Boolean(contextSuccess);

  return (
    <textarea
      ref={ref}
      id={targetId}
      name={targetName}
      disabled={isDisabled}
      readOnly={isReadOnly}
      aria-describedby={ariaDescribedBy}
      aria-invalid={isError ? true : undefined}
      className={cn(
        'w-full border bg-surface text-foreground placeholder:text-muted-foreground transition-all',
        'hover:border-border-strong focus:outline-none',
        sizeClasses[textareaSize],
        !resizable && 'resize-none',
        // Default State
        !isError && !isSuccess && 'border-input focus:border-primary focus:ring-1 focus:ring-primary',

        // Error State
        isError && 'border-danger bg-danger-subtle/10 text-foreground focus:border-danger focus:ring-danger',
        // Success State
        isSuccess && 'border-success bg-success-subtle/10 text-foreground focus:border-success focus:ring-success',
        // Disabled & Readonly
        isDisabled && 'cursor-not-allowed bg-surface-sunken text-muted-foreground opacity-70',
        isReadOnly && 'bg-surface-sunken text-foreground',
        className,
      )}
      {...props}
    />
  );
});
