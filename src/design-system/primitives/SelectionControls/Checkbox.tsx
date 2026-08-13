import { Check, Minus } from '@/design-system/icons';

import {
  forwardRef,
  useEffect,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';

import { useFormField } from '@/design-system/primitives/Form/FormContext';
import { cn } from '@/utils';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Label text or node displayed alongside checkbox. */
  label?: ReactNode;
  /** Subtext description below label. */
  description?: ReactNode;
  /** Indeterminate state indicator (dash). */
  indeterminate?: boolean;
  /** Size step. Default is 'md'. */
  checkboxSize?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-4 w-4 rounded-sm',
  md: 'h-5 w-5 rounded-md',
  lg: 'h-6 w-6 rounded-md',
};

const iconSizeClasses = {
  sm: 'h-3 w-3',
  md: 'h-3.5 w-3.5',
  lg: 'h-4 w-4',
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  {
    label,
    description,
    indeterminate = false,
    checkboxSize = 'md',
    className,
    disabled: propDisabled,
    id: propId,
    name: propName,
    checked,
    ...props
  },
  ref,
) {
  const { id: contextId, name: contextName, disabled: contextDisabled } = useFormField();

  const targetId = propId ?? contextId;
  const targetName = propName ?? contextName;
  const isDisabled = propDisabled ?? contextDisabled;

  const innerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = (ref && typeof ref === 'object' && ref.current) ? ref.current : innerRef.current;
    if (el) {
      el.indeterminate = indeterminate;
    }
  }, [indeterminate, ref]);

  const checkboxNode = (
    <div className="relative inline-flex items-center">
      <input
        ref={ref ?? innerRef}
        type="checkbox"
        id={targetId}
        name={targetName}
        disabled={isDisabled}
        checked={checked}
        className={cn(
          'peer appearance-none border border-input bg-surface cursor-pointer transition-all',
          'checked:bg-primary checked:border-primary',
          'focus:outline-none focus:ring-1 focus:ring-primary',

          isDisabled && 'cursor-not-allowed bg-surface-sunken opacity-60 border-border-subtle',
          sizeClasses[checkboxSize],
          className,
        )}
        {...props}
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-primary-foreground opacity-0 peer-checked:opacity-100 peer-indeterminate:opacity-100 transition-opacity">
        {indeterminate ? (
          <Minus className={cn(iconSizeClasses[checkboxSize], 'stroke-[3]')} />
        ) : (
          <Check className={cn(iconSizeClasses[checkboxSize], 'stroke-[3]')} />
        )}
      </span>
    </div>
  );

  if (!label && !description) {
    return checkboxNode;
  }

  return (
    <label
      htmlFor={targetId}
      className={cn(
        'inline-flex items-start gap-2.5 select-none cursor-pointer',
        isDisabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <div className="pt-0.5">{checkboxNode}</div>
      <div className="space-y-0.5">
        {label && <p className="type-body-sm font-medium text-foreground">{label}</p>}
        {description && <p className="type-body-xs text-muted-foreground">{description}</p>}
      </div>
    </label>
  );
});
