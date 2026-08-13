import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

import { useFormField } from '@/design-system/primitives/Form/FormContext';
import { cn } from '@/utils';

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Label text or node displayed alongside switch. */
  label?: ReactNode;
  /** Description subtext. */
  description?: ReactNode;
  /** Size step. Default is 'md'. */
  switchSize?: 'sm' | 'md' | 'lg';
}

const trackClasses = {
  sm: 'h-4 w-7',
  md: 'h-5 w-9',
  lg: 'h-6 w-11',
};

const thumbClasses = {
  sm: 'h-3 w-3 translate-x-0.5 peer-checked:translate-x-[0.85rem]',
  md: 'h-4 w-4 translate-x-0.5 peer-checked:translate-x-[1.1rem]',
  lg: 'h-5 w-5 translate-x-0.5 peer-checked:translate-x-[1.35rem]',
};

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  {
    label,
    description,
    switchSize = 'md',
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

  const switchNode = (
    <div className="relative inline-flex items-center">
      <input
        ref={ref}
        type="checkbox"
        role="switch"
        id={targetId}
        name={targetName}
        disabled={isDisabled}
        checked={checked}
        aria-checked={checked}
        className={cn(
          'peer appearance-none rounded-full bg-input cursor-pointer transition-colors duration-200',
          'checked:bg-primary',
          'focus:outline-none focus:ring-1 focus:ring-primary',

          isDisabled && 'cursor-not-allowed bg-surface-sunken opacity-60',
          trackClasses[switchSize],
          className,
        )}
        {...props}
      />
      <span
        className={cn(
          'pointer-events-none absolute rounded-full bg-surface shadow-xs transition-transform duration-200 ease-out',
          thumbClasses[switchSize],
        )}
      />
    </div>
  );

  if (!label && !description) {
    return switchNode;
  }

  return (
    <label
      htmlFor={targetId}
      className={cn(
        'inline-flex items-center justify-between gap-4 select-none cursor-pointer w-full',
        isDisabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <div className="space-y-0.5">
        {label && <p className="type-body-sm font-medium text-foreground">{label}</p>}
        {description && <p className="type-body-xs text-muted-foreground">{description}</p>}
      </div>
      {switchNode}
    </label>
  );
});
