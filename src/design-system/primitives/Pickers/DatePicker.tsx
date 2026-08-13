import * as Popover from '@radix-ui/react-popover';
import { addDays, format, isValid, parseISO } from 'date-fns';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from '@/design-system/icons';

import { forwardRef, useState } from 'react';

import { useFormField } from '@/design-system/primitives/Form/FormContext';
import { cn } from '@/utils';

export interface DatePickerProps {
  /** ISO String date string "YYYY-MM-DD" or Date object. */
  value?: string | Date;
  /** Initial default value. */
  defaultValue?: string | Date;
  /** Callback when date changes. Passes formatted "YYYY-MM-DD" string. */
  onChange?: (dateString: string) => void;
  /** Date display format. Default is 'PPP' (e.g. "Jul 26, 2026"). */
  displayFormat?: string;
  /** Placeholder text when no date selected. */
  placeholder?: string;
  /** Allow clearing selected date. Default is true. */
  isClearable?: boolean;
  /** Disable picker interaction. */
  disabled?: boolean;
  className?: string;
}

export const DatePicker = forwardRef<HTMLButtonElement, DatePickerProps>(function DatePicker(
  {
    value: propValue,
    defaultValue,
    onChange,
    displayFormat = 'MMM d, yyyy',
    placeholder = 'Select date...',
    isClearable = true,
    disabled: propDisabled,
    className,
  },
  ref,
) {
  const { disabled: contextDisabled } = useFormField();
  const isDisabled = propDisabled ?? contextDisabled;

  const [selectedDate, setSelectedDate] = useState<Date | null>(() => {
    const init = propValue ?? defaultValue;
    if (!init) return null;
    if (init instanceof Date) return init;
    const parsed = parseISO(init);
    return isValid(parsed) ? parsed : null;
  });

  const [viewDate, setViewDate] = useState<Date>(selectedDate ?? new Date());
  const [open, setOpen] = useState(false);

  const currentDate = propValue !== undefined
    ? (typeof propValue === 'string' ? (isValid(parseISO(propValue)) ? parseISO(propValue) : null) : propValue)
    : selectedDate;

  const handleSelectDate = (d: Date) => {
    setSelectedDate(d);
    onChange?.(format(d, 'yyyy-MM-dd'));
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedDate(null);
    onChange?.('');
  };

  // Calendar rendering helpers
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

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
            !currentDate && 'text-muted-foreground',
            className,
          )}

        >
          <div className="flex items-center gap-2 overflow-hidden">
            <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {currentDate ? format(currentDate, displayFormat) : placeholder}
            </span>
          </div>
          {isClearable && currentDate && !isDisabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-popover w-[19rem] rounded-md border border-border bg-surface p-4 shadow-md focus:outline-none animate-zoom-in space-y-4"
        >
          {/* Preset Shortcuts */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => handleSelectDate(new Date())}
              className="rounded-sm bg-surface-sunken px-2 py-1 type-body-xs font-medium text-foreground hover:bg-primary-subtle hover:text-primary transition-colors"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handleSelectDate(addDays(new Date(), -1))}
              className="rounded-sm bg-surface-sunken px-2 py-1 type-body-xs font-medium text-foreground hover:bg-primary-subtle hover:text-primary transition-colors"
            >
              Yesterday
            </button>
            <button
              type="button"
              onClick={() => handleSelectDate(addDays(new Date(), 7))}
              className="rounded-sm bg-surface-sunken px-2 py-1 type-body-xs font-medium text-foreground hover:bg-primary-subtle hover:text-primary transition-colors"
            >
              +7 Days
            </button>
            <button
              type="button"
              onClick={() => handleSelectDate(addDays(new Date(), 30))}
              className="rounded-sm bg-surface-sunken px-2 py-1 type-body-xs font-medium text-foreground hover:bg-primary-subtle hover:text-primary transition-colors"
            >
              +30 Days
            </button>
          </div>

          {/* Month Header Navigation */}
          <div className="flex items-center justify-between">
            <h4 className="type-body-sm text-foreground">
              {format(viewDate, 'MMMM yyyy')}
            </h4>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setViewDate(new Date(year, month - 1, 1))}
                className="rounded-sm p-1 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewDate(new Date(year, month + 1, 1))}
                className="rounded-sm p-1 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Calendar Grid Header */}
          <div className="grid grid-cols-7 text-center type-body-xs font-medium text-muted-foreground">
            <span>Su</span>
            <span>Mo</span>
            <span>Tu</span>
            <span>We</span>
            <span>Th</span>
            <span>Fr</span>
            <span>Sa</span>
          </div>

          {/* Calendar Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {Array.from({ length: firstDayOfMonth }, (_, slotIndex) => `slot-${slotIndex}`).map((slotKey) => (
              <div key={slotKey} />
            ))}

            {daysArray.map((day) => {
              const thisDate = new Date(year, month, day);
              const isSelected =
                currentDate &&
                currentDate.getFullYear() === year &&
                currentDate.getMonth() === month &&
                currentDate.getDate() === day;
              const isToday =
                new Date().getFullYear() === year &&
                new Date().getMonth() === month &&
                new Date().getDate() === day;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleSelectDate(thisDate)}
                  className={cn(
                    'h-8 w-8 rounded-md type-body-xs font-medium transition-all flex items-center justify-center mx-auto',
                    isSelected
                      ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                      : 'hover:bg-surface-hover text-foreground',
                    isToday && !isSelected && 'border border-primary text-primary font-semibold',
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
});
