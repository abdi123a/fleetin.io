import * as Popover from '@radix-ui/react-popover';
import { Clock } from '@/design-system/icons';

import { forwardRef, useState } from 'react';

import { useFormField } from '@/design-system/primitives/Form/FormContext';
import { cn } from '@/utils';

export interface TimePickerProps {
  /** Time value formatted as "HH:MM" or "HH:MM AM/PM". */
  value?: string;
  defaultValue?: string;
  onChange?: (timeString: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const PRESET_TIMES = ['08:00 AM', '09:00 AM', '10:30 AM', '01:00 PM', '02:30 PM', '05:00 PM', '06:30 PM'];

export const TimePicker = forwardRef<HTMLButtonElement, TimePickerProps>(function TimePicker(
  {
    value: propValue,
    defaultValue = '09:00 AM',
    onChange,
    placeholder = 'Select time...',
    disabled: propDisabled,
    className,
  },
  ref,
) {
  const { disabled: contextDisabled } = useFormField();
  const isDisabled = propDisabled ?? contextDisabled;

  const [time, setTime] = useState<string>(propValue ?? defaultValue);
  const [open, setOpen] = useState(false);

  const currentTime = propValue !== undefined ? propValue : time;

  const handleSelect = (t: string) => {
    setTime(t);
    onChange?.(t);
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          ref={ref}
          type="button"
          disabled={isDisabled}
          className={cn(
            'flex h-10 w-full items-center justify-between border border-input bg-surface px-3.5 py-2 text-sm rounded-md transition-all',
            'hover:border-border-strong hover:bg-surface-hover focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary',
            isDisabled && 'cursor-not-allowed bg-surface-sunken text-muted-foreground opacity-70',
            !currentTime && 'text-muted-foreground',
            className,
          )}

        >
          <div className="flex items-center gap-2 overflow-hidden">
            <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{currentTime || placeholder}</span>
          </div>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-popover w-56 rounded-md border border-border bg-surface p-3 shadow-md focus:outline-none animate-zoom-in space-y-3"
        >
          <div className="space-y-1">
            <p className="type-body-xs uppercase tracking-wider text-muted-foreground">
              Quick Select Time
            </p>
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {PRESET_TIMES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleSelect(t)}
                  className={cn(
                    'rounded-sm px-2.5 py-1.5 type-body-xs font-medium transition-all text-center',
                    currentTime === t
                      ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                      : 'bg-surface-sunken hover:bg-primary-subtle hover:text-primary text-foreground',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
});
