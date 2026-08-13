import * as Popover from '@radix-ui/react-popover';
import { Check, Palette } from '@/design-system/icons';

import { forwardRef, useState } from 'react';

import { useFormField } from '@/design-system/primitives/Form/FormContext';
import { cn } from '@/utils';

export interface ColorPickerProps {
  /** Selected hex color value, e.g. "#0d9488". */
  value?: string;
  defaultValue?: string;
  onChange?: (colorHex: string) => void;
  disabled?: boolean;
  className?: string;
}

const FLEETIN_PALETTE = [
  { label: 'FLEETIN Teal (Primary)', hex: '#60969d' },
  { label: 'FLEETIN Orange (Accent)', hex: '#f9ac17' },
  { label: 'Green (Success)', hex: '#2e7d32' },
  { label: 'Amber (Warning)', hex: '#ffb502' },
  { label: 'Red (Danger)', hex: '#d32f2f' },
  { label: 'Blue (Info)', hex: '#3983de' },
  { label: 'Slate Neutral', hex: '#757575' },
  { label: 'Dark Charcoal', hex: '#212121' },
];

export const ColorPicker = forwardRef<HTMLButtonElement, ColorPickerProps>(function ColorPicker(
  {
    value: propValue,
    defaultValue = '#60969d',
    onChange,
    disabled: propDisabled,
    className,
  },
  ref,
) {
  const { disabled: contextDisabled } = useFormField();
  const isDisabled = propDisabled ?? contextDisabled;

  const [color, setColor] = useState<string>(propValue ?? defaultValue);
  const [open, setOpen] = useState(false);

  const currentColor = propValue !== undefined ? propValue : color;

  const handleSelectColor = (hex: string) => {
    setColor(hex);
    onChange?.(hex);
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
            className,
          )}

        >
          <div className="flex items-center gap-2.5">
            <span
              className="h-4 w-4 rounded-full border border-border shadow-xs shrink-0"
              style={{ backgroundColor: currentColor }}
            />
            <span className="font-mono text-xs uppercase font-medium">{currentColor}</span>
          </div>
          <Palette className="h-4 w-4 text-muted-foreground" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-popover w-64 rounded-md border border-border bg-surface p-4 shadow-md focus:outline-none animate-zoom-in space-y-4"
        >
          <div className="space-y-2">
            <p className="type-body-xs uppercase tracking-wider text-muted-foreground">
              FLEETIN Palette
            </p>
            <div className="grid grid-cols-4 gap-2">
              {FLEETIN_PALETTE.map((item) => (
                <button
                  key={item.hex}
                  type="button"
                  title={item.label}
                  onClick={() => handleSelectColor(item.hex)}
                  className="group relative flex h-8 w-full items-center justify-center rounded-md border border-border transition-transform hover:scale-105"
                  style={{ backgroundColor: item.hex }}
                >
                  {currentColor.toLowerCase() === item.hex.toLowerCase() && (
                    <Check className="h-4 w-4 text-white drop-shadow-md" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-border">
            <label className="type-body-xs font-medium text-foreground">Custom HEX Code</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={currentColor}
                onChange={(e) => handleSelectColor(e.target.value)}
                className="h-8 w-8 cursor-pointer rounded-sm border border-input p-0.5 bg-surface"
              />
              <input
                type="text"
                value={currentColor}
                onChange={(e) => handleSelectColor(e.target.value)}
                placeholder="#0d9488"
                className="w-full rounded-md border border-input bg-surface px-2.5 py-1 font-mono text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
});
