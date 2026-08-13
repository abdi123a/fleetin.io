import { AlertCircle, Info } from '@/design-system/icons';

import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from '@/utils';

import { useFormField } from './FormContext';

export interface HelperTextProps extends HTMLAttributes<HTMLParagraphElement> {
  /** Visual intent/tone of helper text. Defaults to 'muted'. */
  intent?: 'muted' | 'warning' | 'info';
  /** Include leading status icon. */
  showIcon?: boolean;
}

export const HelperText = forwardRef<HTMLParagraphElement, HelperTextProps>(function HelperText(
  { intent = 'muted', showIcon = false, className, children, id, ...props },
  ref,
) {
  const { formHelperId } = useFormField();
  const targetId = id ?? formHelperId;

  if (!children) return null;

  const intentStyles = {
    muted: 'text-muted-foreground',
    warning: 'text-warning-foreground font-medium',
    info: 'text-info font-medium',
  };

  const IconComponent = intent === 'warning' ? AlertCircle : intent === 'info' ? Info : null;

  return (
    <p
      ref={ref}
      id={targetId}
      className={cn('flex items-center gap-1.5 type-body-xs leading-normal', intentStyles[intent], className)}
      {...props}
    >
      {showIcon && IconComponent && <IconComponent className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      <span>{children}</span>
    </p>
  );
});
