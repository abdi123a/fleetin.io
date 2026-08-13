import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown, Search } from '@/design-system/icons';

import { forwardRef, useMemo, useState, type ReactNode } from 'react';

import { useFormField } from '@/design-system/primitives/Form/FormContext';
import { cn } from '@/utils';

export interface ComboboxOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** Rendered before the label, both in the trigger (when selected) and in the list. */
  icon?: ReactNode;
}

export interface ComboboxProps {
  /** Currently selected option value. */
  value?: string;
  /** Available options. */
  options: ComboboxOption[];
  /** Callback with the newly selected value. */
  onChange?: (value: string) => void;
  /** Text shown when nothing is selected. */
  placeholder?: string;
  /** Icon rendered before the selected label. */
  leadingIcon?: ReactNode;
  /** Hides the search box — use for short option lists. */
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Combobox — FLEETIN's styled replacement for the native `<select>`.
 * Same popover/trigger language as DatePicker and TimePicker.
 */
export const Combobox = forwardRef<HTMLButtonElement, ComboboxProps>(function Combobox(
  {
    value,
    options,
    onChange,
    placeholder = 'Select...',
    leadingIcon,
    searchable = true,
    disabled: propDisabled,
    className,
  },
  ref,
) {
  const { disabled: contextDisabled } = useFormField();
  const isDisabled = propDisabled ?? contextDisabled;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, searchable]);

  const handleSelect = (v: string) => {
    onChange?.(v);
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <Popover.Trigger asChild>
        <button
          ref={ref}
          type="button"
          disabled={isDisabled}
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 border border-input bg-surface px-3.5 py-2 text-sm rounded-md transition-all cursor-pointer',
            'hover:border-border-strong hover:bg-surface-hover focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary',
            isDisabled && 'cursor-not-allowed bg-surface-sunken text-muted-foreground opacity-70',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          <span className="flex items-center gap-2 overflow-hidden">
            {leadingIcon}
            {selected?.icon}
            <span className="truncate">{selected ? selected.label : placeholder}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-popover w-[var(--radix-popover-trigger-width)] min-w-56 rounded-md border border-border bg-surface shadow-md focus:outline-none animate-zoom-in overflow-hidden"
        >
          {searchable && options.length > 1 && (
            <div className="p-1.5 border-b border-border/60">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search..."
                  className="h-8 w-full rounded-sm border border-transparent bg-surface-sunken pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
              </div>
            </div>
          )}
          <div
            className="max-h-64 overflow-y-auto p-1"
            onWheel={(e) => {
              // A Popover portals straight to <body>, sitting outside the
              // scroll-lock region a parent Dialog/Sheet applies while open —
              // that lock swallows the native wheel-driven scroll before it
              // ever reaches us, so the list has to scroll itself manually.
              e.currentTarget.scrollTop += e.deltaY;
            }}
          >
            {filtered.length === 0 && (
              <div className="px-2 py-3 text-center type-body-xs text-muted-foreground">No matches</div>
            )}
            {filtered.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => handleSelect(opt.value)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-left type-body-xs font-medium transition-colors',
                    isSelected ? 'bg-primary-subtle text-primary' : 'text-foreground hover:bg-surface-hover',
                    opt.disabled && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2 overflow-hidden">
                    {opt.icon}
                    <span className="truncate">{opt.label}</span>
                  </span>
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
});
