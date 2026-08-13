import { useState } from 'react';
import { Calendar, ChevronDown } from '@/design-system/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/design-system';
import { DATE_PRESET_LABELS, type DatePreset } from '@/features/shipper-bi/contracts';
import { formatDate } from '@/utils';

/**
 * The one control that scopes the whole page.
 *
 * Every figure below the greeting is period-scoped, so the window has to be
 * stated where the reader can see it — and the resolved dates are printed in
 * the menu, because "last 30 days" means something different on the 1st than
 * on the 30th and a dashboard that will not say which days it counted is a
 * dashboard nobody can check.
 */

const PRESETS: DatePreset[] = [
  'last_7_days',
  'last_30_days',
  'last_90_days',
  'this_month',
  'last_month',
  'this_quarter',
  'custom',
];

export interface TimeframePickerProps {
  preset: DatePreset;
  from: string;
  to: string;
  onChange: (preset: DatePreset) => void;
  onCustomChange?: (from: string, to: string) => void;
}

export function TimeframePicker({
  preset,
  from,
  to,
  onChange,
  onCustomChange,
}: TimeframePickerProps) {
  const [customFrom, setCustomFrom] = useState(from ? from.slice(0, 10) : '2026-07-01');
  const [customTo, setCustomTo] = useState(to ? to.slice(0, 10) : '2026-08-05');

  const handlePresetSelect = (value: string) => {
    const selectedPreset = value as DatePreset;
    onChange(selectedPreset);
  };

  const handleApplyCustom = () => {
    if (onCustomChange && customFrom && customTo) {
      onCustomChange(customFrom, customTo);
    } else {
      onChange('custom');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground shadow-xs hover:bg-surface-sunken transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span>{DATE_PRESET_LABELS[preset]}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 p-2">
        <DropdownMenuRadioGroup
          value={preset}
          onValueChange={handlePresetSelect}
        >
          {PRESETS.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {DATE_PRESET_LABELS[option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        {preset === 'custom' && (
          <div className="mt-2.5 border-t border-border pt-2.5 space-y-2">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-muted-foreground">Start date</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-muted-foreground">End date</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <button
              type="button"
              onClick={handleApplyCustom}
              className="mt-1 w-full rounded-md bg-primary py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer"
            >
              Apply Range
            </button>
          </div>
        )}

        <p className="mt-2 border-t border-border/60 px-1 pb-0.5 pt-2 text-[11px] text-muted-foreground">
          {formatDate(from, 'date')} — {formatDate(to, 'date')}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

