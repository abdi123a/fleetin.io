import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

import { useFormField } from '@/design-system/primitives/Form/FormContext';
import { cn } from '@/utils';

export interface RadioProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Label text or element. */
  label?: ReactNode;
  /** Subtext description under label. */
  description?: ReactNode;
  /** Radio circle size. Default is 'md'. */
  radioSize?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};

const dotSizeClasses = {
  sm: 'h-1.5 w-1.5',
  md: 'h-2 w-2',
  lg: 'h-2.5 w-2.5',
};

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { label, description, radioSize = 'md', className, disabled: propDisabled, id: propId, name: propName, ...props },
  ref,
) {
  const { id: contextId, name: contextName, disabled: contextDisabled } = useFormField();

  const targetId = propId ?? contextId;
  const targetName = propName ?? contextName;
  const isDisabled = propDisabled ?? contextDisabled;

  const radioNode = (
    <div className="relative inline-flex items-center justify-center">
      <input
        ref={ref}
        type="radio"
        id={targetId}
        name={targetName}
        disabled={isDisabled}
        className={cn(
          'peer appearance-none rounded-full border border-input bg-surface cursor-pointer transition-all',
          'checked:border-primary',
          'focus:outline-none focus:ring-1 focus:ring-primary',

          isDisabled && 'cursor-not-allowed bg-surface-sunken opacity-60 border-border-subtle',
          sizeClasses[radioSize],
          className,
        )}
        {...props}
      />
      <span
        className={cn(
          'pointer-events-none absolute rounded-full bg-primary opacity-0 peer-checked:opacity-100 transition-opacity',
          dotSizeClasses[radioSize],
        )}
      />
    </div>
  );

  if (!label && !description) {
    return radioNode;
  }

  return (
    <label
      htmlFor={targetId}
      className={cn(
        'inline-flex items-start gap-2.5 select-none cursor-pointer',
        isDisabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <div className="pt-0.5">{radioNode}</div>
      <div className="space-y-0.5">
        {label && <p className="type-body-sm font-medium text-foreground">{label}</p>}
        {description && <p className="type-body-xs text-muted-foreground">{description}</p>}
      </div>
    </label>
  );
});

export interface RadioGroupProps {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  orientation?: 'vertical' | 'horizontal';
  className?: string;
  children: ReactNode;
}

export function RadioGroup({
  orientation = 'vertical',
  className,
  children,
}: RadioGroupProps) {
  return (
    <div
      role="radiogroup"
      className={cn(
        orientation === 'vertical' ? 'flex flex-col gap-3' : 'flex flex-wrap items-center gap-5',
        className,
      )}
    >
      {children}
    </div>
  );
}
