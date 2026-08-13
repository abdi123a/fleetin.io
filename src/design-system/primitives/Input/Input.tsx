import { Eye, EyeOff, X } from '@/design-system/icons';

import {
  forwardRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';

import { useFormField } from '@/design-system/primitives/Form/FormContext';
import { cn } from '@/utils';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Size step of the input. Default is 'md'. */
  inputSize?: 'sm' | 'md' | 'lg';
  /** Icon rendered before the input value. */
  leadingIcon?: ReactNode;
  /** Icon rendered after the input value. */
  trailingIcon?: ReactNode;
  /** Text prefix rendered inside input (e.g. "$", "https://"). */
  prefixText?: string;
  /** Text suffix rendered inside input (e.g. ".com", "kg"). */
  suffixText?: string;
  /** Enables password visibility toggle button. */
  isPassword?: boolean;
  /** Enables clear button when input has a value. */
  isClearable?: boolean;
  /** Callback when clear button is clicked. */
  onClear?: () => void;
  /** Force error state highlight. Reads from FormField context if omitted. */
  hasError?: boolean;
  /** Force success state highlight. Reads from FormField context if omitted. */
  hasSuccess?: boolean;
}

const sizeClasses = {
  sm: 'h-8 px-2.5 text-xs rounded-sm',
  md: 'h-10 px-3.5 text-sm rounded-md',
  lg: 'h-11 px-4 text-base rounded-md',
};

const iconSizeClasses = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-4.5 w-4.5',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    inputSize = 'md',
    leadingIcon,
    trailingIcon,
    prefixText,
    suffixText,
    isPassword = false,
    isClearable = false,
    onClear,
    hasError: propHasError,
    hasSuccess: propHasSuccess,
    className,
    disabled: propDisabled,
    readOnly: propReadOnly,
    type: propType = 'text',
    value,
    defaultValue,
    onChange,
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

  const [showPassword, setShowPassword] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue ?? '');

  const targetId = propId ?? contextId;
  const targetName = propName ?? contextName;
  const isDisabled = propDisabled ?? contextDisabled;
  const isReadOnly = propReadOnly ?? contextReadOnly;
  const isError = propHasError ?? Boolean(contextError);
  const isSuccess = propHasSuccess ?? Boolean(contextSuccess);

  const currentValue = value !== undefined ? value : internalValue;
  const hasValue = String(currentValue ?? '').length > 0;

  const actualType = isPassword ? (showPassword ? 'text' : 'password') : propType;

  return (
    <div className="relative flex w-full items-center">
      {/* Leading Icon or Prefix Text */}
      {(leadingIcon || prefixText) && (
        <div className="absolute left-3 z-10 flex items-center gap-1 text-muted-foreground pointer-events-none select-none">
          {leadingIcon}
          {prefixText && <span className="type-body-sm font-medium">{prefixText}</span>}
        </div>
      )}

      <input
        ref={ref}
        id={targetId}
        name={targetName}
        type={actualType}
        disabled={isDisabled}
        readOnly={isReadOnly}
        value={value}
        defaultValue={defaultValue}
        aria-describedby={ariaDescribedBy}
        aria-invalid={isError ? true : undefined}
        onChange={(e) => {
          if (value === undefined) setInternalValue(e.target.value);
          onChange?.(e);
        }}
        className={cn(
          'w-full border bg-surface text-foreground placeholder:text-muted-foreground transition-all',
          'hover:border-border-strong focus:outline-none',
          sizeClasses[inputSize],
          // Default State
          !isError && !isSuccess && 'border-input focus:border-primary focus:ring-1 focus:ring-primary',

          // Error State
          isError && 'border-danger bg-danger-subtle/10 text-foreground focus:border-danger focus:ring-danger',
          // Success State
          isSuccess && 'border-success bg-success-subtle/10 text-foreground focus:border-success focus:ring-success',
          // Disabled & Readonly
          isDisabled && 'cursor-not-allowed bg-surface-sunken text-muted-foreground opacity-70',
          isReadOnly && 'bg-surface-sunken text-foreground',
          // Padding adjustments for leading/trailing elements
          (leadingIcon || prefixText) && 'pl-9',
          (trailingIcon || suffixText || isPassword || isClearable) && 'pr-9',
          className,
        )}
        {...props}
      />

      {/* Trailing Controls: Password Toggle, Clear Button, Suffix Text, Trailing Icon */}
      <div className="absolute right-3 z-10 flex items-center gap-1.5 text-muted-foreground">
        {suffixText && <span className="type-body-sm font-medium select-none">{suffixText}</span>}

        {isClearable && hasValue && !isDisabled && !isReadOnly && (
          <button
            type="button"
            aria-label="Clear input"
            onClick={() => {
              if (value === undefined) setInternalValue('');
              onClear?.();
            }}
            className="rounded-sm p-0.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground transition-colors"
          >
            <X className={iconSizeClasses[inputSize]} />
          </button>
        )}

        {isPassword && !isDisabled && (
          <button
            type="button"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            onClick={() => setShowPassword((prev) => !prev)}
            className="rounded-sm p-0.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground transition-colors"
          >
            {showPassword ? (
              <EyeOff className={iconSizeClasses[inputSize]} />
            ) : (
              <Eye className={iconSizeClasses[inputSize]} />
            )}
          </button>
        )}

        {trailingIcon && !isPassword && !isClearable && trailingIcon}
      </div>
    </div>
  );
});
