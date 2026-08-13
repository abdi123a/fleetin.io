import { Monitor, Moon, Sun } from '@/design-system/icons';

import { Tooltip } from '@/design-system';
import { useTheme } from '@/hooks';
import type { ThemeMode } from '@/types';
import { cn } from '@/utils';

/**
 * ThemeToggle — segmented Light / Dark / System control.
 *
 * Supports `full` segmented control or sleek `compact` single-icon toggle for collapsed rails.
 */

interface ThemeOption {
  value: ThemeMode;
  label: string;
  icon: typeof Sun;
}

const THEME_OPTIONS: ThemeOption[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export interface ThemeToggleProps {
  /** `full` shows labels; `compact` / `icon` is a single sleek icon toggle for collapsed rail. */
  variant?: 'full' | 'compact' | 'icon';
  /**
   * Which surface the control sits on. `surface` is the page palette; `sidebar`
   * swaps to the `--sidebar-*` roles, because the page's muted greys and sunken
   * fill are mixed for white and turn to mud on the brand panel.
   */
  tone?: 'surface' | 'sidebar';
  className?: string;
}

export function ThemeToggle({ variant = 'full', tone = 'surface', className }: ThemeToggleProps) {
  const { mode, setMode } = useTheme();
  const isSingleIcon = variant === 'compact' || variant === 'icon';
  const onSidebar = tone === 'sidebar';

  if (isSingleIcon) {
    const currentOption = THEME_OPTIONS.find((opt) => opt.value === mode) || THEME_OPTIONS[0];
    const Icon = currentOption ? currentOption.icon : Sun;
    const label = currentOption ? currentOption.label : 'Theme';

    const cycleTheme = () => {
      if (mode === 'light') setMode('dark');
      else if (mode === 'dark') setMode('system');
      else setMode('light');
    };

    return (
      <Tooltip content={`Theme: ${label}`} side="right">
        <button
          type="button"
          aria-label={`Current theme: ${label}. Click to switch.`}
          onClick={cycleTheme}
          className={cn(
            'flex size-8 items-center justify-center rounded-md border transition duration-fast focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
            onSidebar
              ? 'border-sidebar-border bg-sidebar-item-hover text-sidebar-foreground hover:text-sidebar-item-hover-foreground'
              : 'border-border bg-surface-sunken text-primary hover:bg-muted hover:text-foreground',
            className,
          )}
        >
          <Icon className="size-4 shrink-0" aria-hidden />
        </button>
      </Tooltip>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        'flex w-full items-center gap-0.5 rounded-full border p-1',
        onSidebar ? 'border-sidebar-border bg-sidebar-item-hover' : 'border-border bg-surface-sunken',
        className,
      )}
    >
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
        const isSelected = mode === value;

        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={label}
            title={label}
            onClick={() => setMode(value)}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5',
              'text-xs font-semibold transition-colors duration-fast ease-out',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
              onSidebar
                ? isSelected
                  ? 'bg-sidebar-item-active font-bold text-sidebar-item-active-foreground shadow-xs'
                  : 'text-sidebar-foreground hover:text-sidebar-item-hover-foreground'
                : isSelected
                  ? 'bg-surface font-bold text-primary shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
