import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from '@/utils';

import { useFormField } from './FormContext';

export interface CharacterCounterProps extends HTMLAttributes<HTMLSpanElement> {
  /** Current character count. */
  current: number;
  /** Maximum character length allowed. */
  max: number;
  /** Threshold (as percentage 0-1 or remaining chars count) to highlight warning. Default is 90% or 10 chars remaining. */
  warningThreshold?: number;
}

export const CharacterCounter = forwardRef<HTMLSpanElement, CharacterCounterProps>(
  function CharacterCounter({ current, max, warningThreshold = 0.9, className, id, ...props }, ref) {
    const { formCharacterCounterId } = useFormField();
    const targetId = id ?? formCharacterCounterId;

    const remaining = max - current;
    const ratio = current / max;
    const isWarning = (warningThreshold <= 1 ? ratio >= warningThreshold : remaining <= warningThreshold) && remaining >= 0;
    const isExceeded = remaining < 0;

    return (
      <span
        ref={ref}
        id={targetId}
        aria-live="polite"
        className={cn(
          'type-body-xs font-mono tabular-nums transition-colors',
          isExceeded
            ? 'font-semibold text-danger'
            : isWarning
              ? 'font-medium text-warning-foreground'
              : 'text-muted-foreground',
          className,
        )}
        {...props}
      >
        {current} / {max}
      </span>
    );
  },
);
