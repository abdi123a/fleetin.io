import { ChevronDown } from '@/design-system/icons';

import {
  forwardRef,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';

import { useFormField } from '@/design-system/primitives/Form/FormContext';
import { cn } from '@/utils';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** Size step of the select. Default is 'md'. */
  selectSize?: 'sm' | 'md' | 'lg';
  /** Leading icon rendered before selection. */
  leadingIcon?: ReactNode;
  /** Placeholder text rendered as default disabled option. */
  placeholder?: string;
  /** Option items array if not passing option children directly. */
  options?: SelectOption[];
  /** Force error highlight. Reads from FormField context if omitted. */
  hasError?: boolean;
  /** Force success highlight. Reads from FormField context if omitted. */
  hasSuccess?: boolean;
  /** Class name applied to the outer wrapper element. Defaults to 'w-full'. */
  containerClassName?: string;
}

/* All three sit on `--radius-md`, the token documented as "buttons, default
   control radius". `sm` used to take `rounded-sm` — the *chip* radius — which
   is what made a sort select read as a foreign object beside the search field
   it shares a row with: same height, four pixels less corner. A small select is
   still a control, not a chip. */
const sizeClasses = {
  sm: 'h-8 px-2.5 text-xs rounded-md pr-8',
  md: 'h-10 px-3.5 text-sm rounded-md pr-10',
  lg: 'h-11 px-4 text-base rounded-md pr-11',
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    selectSize = 'md',
    leadingIcon,
    placeholder,
    options,
    hasError: propHasError,
    hasSuccess: propHasSuccess,
    containerClassName,
    className,
    disabled: propDisabled,
    id: propId,
    name: propName,
    children,
    defaultValue,
    value,
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
  } = useFormField();

  const targetId = propId ?? contextId;
  const targetName = propName ?? contextName;
  const isDisabled = propDisabled ?? contextDisabled;
  const isError = propHasError ?? Boolean(contextError);
  const isSuccess = propHasSuccess ?? Boolean(contextSuccess);

  return (
    <div className={cn('relative flex items-center', containerClassName || 'w-full')}>
      {leadingIcon && (
        <div className="absolute left-3 z-10 text-muted-foreground pointer-events-none select-none">
          {leadingIcon}
        </div>
      )}

      <select
        ref={ref}
        id={targetId}
        name={targetName}
        disabled={isDisabled}
        defaultValue={defaultValue}
        value={value}
        aria-describedby={ariaDescribedBy}
        aria-invalid={isError ? true : undefined}
        className={cn(
          'w-full appearance-none border bg-surface text-foreground placeholder:text-muted-foreground transition-all cursor-pointer',
          'hover:border-border-strong focus:outline-none',
          sizeClasses[selectSize],
          leadingIcon && 'pl-9',
          // Default State
          !isError && !isSuccess && 'border-input focus:border-primary focus:ring-1 focus:ring-primary',

          // Error State
          isError && 'border-danger bg-danger-subtle/10 text-foreground focus:border-danger focus:ring-danger',
          // Success State
          isSuccess && 'border-success bg-success-subtle/10 text-foreground focus:border-success focus:ring-success',
          // Disabled
          isDisabled && 'cursor-not-allowed bg-surface-sunken text-muted-foreground opacity-70',
          className,
        )}
        {...props}
      >
        {placeholder && (
          <option value="" disabled hidden>
            {placeholder}
          </option>
        )}
        {options
          ? options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))
          : children}
      </select>

      <div className="absolute right-3 z-10 text-muted-foreground pointer-events-none">
        <ChevronDown className="h-4 w-4" aria-hidden />
      </div>
    </div>
  );
});
