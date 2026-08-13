import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/design-system';
import { ChevronDown } from '@/design-system/icons';
import { DATE_PRESET_LABELS, type DatePreset } from '@/features/shipper-bi/contracts';
import { cn, formatDate } from '@/utils';

/**
 * The window control that lives *on* a panel, rather than above the page.
 *
 * `PanelScope` states a window; this one sets it. They deliberately share a
 * geometry — same pill, same 12px medium label, same caret — because a reader
 * scanning the console should not have to learn two shapes for "which days am I
 * looking at". The difference is that this one is a real `<button>` and reacts
 * to hover, focus and open state.
 *
 * The resolved dates are printed under the options for the same reason
 * `TimeframePicker` prints them: "last 7 days" means different days on the 1st
 * than on the 30th, and a window that will not say which days it counted is a
 * window nobody can check.
 */

/** The rolling windows a chart panel offers. Longer ranges live on the page picker. */
const BAND_PRESETS: DatePreset[] = ['last_7_days', 'last_30_days', 'last_90_days'];

export interface PanelDatePickerProps {
  preset: DatePreset;
  onChange: (preset: DatePreset) => void;
  /** The resolved window, printed in the menu footer. */
  from: string;
  to: string;
  presets?: DatePreset[];
  align?: 'start' | 'end';
  className?: string;
}

export function PanelDatePicker({
  preset,
  onChange,
  from,
  to,
  presets = BAND_PRESETS,
  align = 'end',
  className,
}: PanelDatePickerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'type-body-xs inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border',
            'bg-surface px-3 py-1.5 font-medium text-muted-foreground transition-colors',
            'hover:bg-surface-sunken hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
            'data-[state=open]:bg-surface-sunken data-[state=open]:text-foreground',
            className,
          )}
        >
          {DATE_PRESET_LABELS[preset]}
          <ChevronDown className="size-3.5 opacity-60" aria-hidden />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align={align} className="w-48">
        <DropdownMenuRadioGroup
          value={preset}
          onValueChange={(value) => onChange(value as DatePreset)}
        >
          {presets.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {DATE_PRESET_LABELS[option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <p className="border-t border-border px-3 pb-1 pt-2 text-[11px] text-muted-foreground">
          {formatDate(from, 'date')} — {formatDate(to, 'date')}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
