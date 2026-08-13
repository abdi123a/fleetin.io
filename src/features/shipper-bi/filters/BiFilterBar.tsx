import { useMemo, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  Filter,
  GitCompare,
  RotateCcw,
  X,
  Check,
} from '@/design-system/icons';
import { Badge, Button } from '@/design-system';
import { cn, formatDate } from '@/utils';
import {
  BI_FILTER_DIMENSION_LABELS,
  BI_FILTER_DIMENSIONS,
  DATE_PRESET_LABELS,
  STAGE_LABELS,
  CONTAINER_TYPES,
  CARGO_TYPES,
  DELAY_OWNER_LABELS,
  DELAY_OWNERS,
  STAGE_KEYS,
  countActiveFilters,
  type BiFilterDimension,
  type BiFilters,
  type DatePreset,
  type Route,
  type Transporter,
} from '../contracts';
import type { UseBiFiltersResult } from './useBiFilters';

const PRESETS: DatePreset[] = [
  'last_7_days',
  'last_30_days',
  'last_90_days',
  'this_month',
  'last_month',
  'this_quarter',
  'custom',
];

export interface BiFilterBarProps {
  state: UseBiFiltersResult;
  transporters: Transporter[];
  routes: Route[];
  /** Rendered at the right — export, refresh. */
  actions?: React.ReactNode;
}

export function BiFilterBar({ state, transporters, routes, actions }: BiFilterBarProps) {
  const { filters, setPreset, toggleCompare, toggleDimension, clearDimension, reset, isDefault } =
    state;
  const [openMenu, setOpenMenu] = useState<'preset' | BiFilterDimension | null>(null);

  const options = useMemo(
    () => buildOptions(transporters, routes),
    [transporters, routes],
  );

  const activeChips = BI_FILTER_DIMENSIONS.flatMap((dimension) =>
    filters[dimension].map((value) => ({
      dimension,
      value,
      label: options[dimension].find((option) => option.value === value)?.label ?? value,
    })),
  );

  const activeFilterCount = countActiveFilters(filters);

  const formattedDateRange = useMemo(() => {
    if (!filters.from || !filters.to) return '';
    return `${formatDate(filters.from, 'date')} — ${formatDate(filters.to, 'date')}`;
  }, [filters.from, filters.to]);

  return (
    /* A toolbar, not a panel: chrome above the hero map competes with it, and
       a bordered card here made the page open with two stacked boxes before
       any data. Only the controls carry an edge. */
    <div className={cn('relative space-y-2.5', openMenu ? 'z-popover' : 'z-10')}>
      {/* MAIN TOOLBAR ROW */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* DATE RANGE SELECTOR DROPDOWN */}
          <DatePresetMenu
            currentPreset={filters.preset}
            formattedRange={formattedDateRange}
            from={filters.from}
            to={filters.to}
            isOpen={openMenu === 'preset'}
            onToggleOpen={() => setOpenMenu(openMenu === 'preset' ? null : 'preset')}
            onSelectPreset={(preset) => {
              setPreset(preset);
              if (preset !== 'custom') {
                setOpenMenu(null);
              }
            }}
            onSelectCustomRange={(fromStr: string, toStr: string) => {
              state.setCustomRange(fromStr, toStr);
              setOpenMenu(null);
            }}
          />

          {/* COMPARE PERIOD TOGGLE */}
          <button
            type="button"
            onClick={toggleCompare}
            aria-pressed={filters.compare}
            className={cn(
              'h-8 px-2.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border',
              filters.compare
                ? 'bg-primary-subtle text-primary-subtle-foreground border-primary/30 dark:text-primary-subtle-foreground shadow-2xs'
                : 'border-border/70 bg-background/80 text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
            title="Overlay preceding period"
          >
            <GitCompare className="w-3.5 h-3.5 text-primary-subtle-foreground" aria-hidden />
            <span>Compare</span>
          </button>

          <span className="hidden md:inline-block h-4 w-px bg-border/70 mx-0.5" aria-hidden />

          {/* FILTER LABEL / ICON */}
          <div className="hidden lg:flex items-center gap-1 text-xs font-semibold text-muted-foreground ml-0.5">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
            <span>Filters:</span>
          </div>

          {/* DIMENSION DROPDOWNS */}
          <div className="flex flex-wrap items-center gap-1.5">
            {BI_FILTER_DIMENSIONS.map((dimension) => (
              <DimensionMenu
                key={dimension}
                dimension={dimension}
                options={options[dimension]}
                selected={filters[dimension]}
                isOpen={openMenu === dimension}
                onToggleOpen={() =>
                  setOpenMenu(openMenu === dimension ? null : dimension)
                }
                onToggleValue={(value) => toggleDimension(dimension, value)}
                onClear={() => clearDimension(dimension)}
              />
            ))}
          </div>
        </div>

        {/* RIGHT ACTIONS & RESET */}
        <div className="flex items-center gap-2 ml-auto">
          {actions}

          {!isDefault && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={reset}
              className="h-8 text-xs text-muted-foreground hover:text-foreground rounded-md px-2"
              title="Reset all filters"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" aria-hidden />
              <span>Reset</span>
              {activeFilterCount > 0 && (
                <span className="ml-1 text-[10px] bg-muted px-1.5 py-0.2 rounded-full font-bold">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* ACTIVE FILTER TAG CHIPS (Row 2, conditionally rendered) */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 animate-in fade-in text-xs">
          <span className="text-[11px] font-medium text-muted-foreground mr-1">Active filters:</span>
          {activeChips.map((chip) => (
            <button
              key={`${chip.dimension}:${chip.value}`}
              type="button"
              onClick={() => toggleDimension(chip.dimension, chip.value)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary-subtle border border-primary/20 px-2 py-0.5 text-[11px] font-medium text-primary-subtle-foreground hover:bg-primary-subtle transition cursor-pointer"
            >
              <span className="text-muted-foreground font-normal">
                {BI_FILTER_DIMENSION_LABELS[chip.dimension]}:
              </span>
              <span>{chip.label}</span>
              <X className="w-3 h-3 text-primary-subtle-foreground hover:text-foreground ml-0.5" aria-hidden />
            </button>
          ))}

          <button
            type="button"
            onClick={reset}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground underline ml-1 cursor-pointer"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

function DatePresetMenu({
  currentPreset,
  formattedRange,
  from,
  to,
  isOpen,
  onToggleOpen,
  onSelectPreset,
  onSelectCustomRange,
}: {
  currentPreset: DatePreset;
  formattedRange: string;
  from?: string;
  to?: string;
  isOpen: boolean;
  onToggleOpen: () => void;
  onSelectPreset: (preset: DatePreset) => void;
  onSelectCustomRange?: (from: string, to: string) => void;
}) {
  const [customFrom, setCustomFrom] = useState(from ? from.slice(0, 10) : '2026-07-01');
  const [customTo, setCustomTo] = useState(to ? to.slice(0, 10) : '2026-08-05');

  const handleApplyCustom = () => {
    if (onSelectCustomRange && customFrom && customTo) {
      onSelectCustomRange(customFrom, customTo);
    } else {
      onSelectPreset('custom');
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className="h-8 px-2.5 rounded-md border border-border/70 bg-background/80 hover:bg-muted/50 text-xs font-semibold text-foreground transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
      >
        <Calendar className="w-3.5 h-3.5 text-primary-subtle-foreground shrink-0" aria-hidden />
        <span>{DATE_PRESET_LABELS[currentPreset]}</span>
        {formattedRange && (
          <span className="hidden xl:inline text-[11px] font-normal text-muted-foreground ml-0.5">
            ({formattedRange})
          </span>
        )}
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ml-0.5',
            isOpen && 'rotate-180 text-primary-subtle-foreground',
          )}
          aria-hidden
        />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-popover" onClick={onToggleOpen} aria-hidden />
          <div
            role="listbox"
            aria-label="Select Date Range"
            className="absolute left-0 top-full z-popover mt-1.5 w-64 rounded-lg border border-border bg-card p-2 shadow-xl animate-in fade-in zoom-in-95 space-y-1"
          >
            <div className="px-2 py-1 border-b border-border/50 text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between items-center">
              <span>Date Range</span>
              {formattedRange && <span className="font-normal text-foreground">{formattedRange}</span>}
            </div>

            <div className="py-1 space-y-0.5">
              {PRESETS.map((preset) => {
                const isSelected = currentPreset === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => onSelectPreset(preset)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer',
                      isSelected
                        ? 'bg-primary-subtle text-primary-subtle-foreground font-bold'
                        : 'text-foreground hover:bg-muted/60',
                    )}
                  >
                    <span>{DATE_PRESET_LABELS[preset]}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-primary-subtle-foreground shrink-0" />}
                  </button>
                );
              })}
            </div>

            {currentPreset === 'custom' && (
              <div className="mt-2 border-t border-border/60 pt-2 px-1 space-y-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Start date</label>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">End date</label>
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
                  className="w-full rounded-md bg-primary py-1.5 text-xs font-bold text-white hover:bg-primary dark:hover:bg-primary transition-colors cursor-pointer"
                >
                  Apply Custom Range
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

interface Option {
  value: string;
  label: string;
}

function DimensionMenu({
  dimension,
  options,
  selected,
  isOpen,
  onToggleOpen,
  onToggleValue,
  onClear,
}: {
  dimension: BiFilterDimension;
  options: Option[];
  selected: string[];
  isOpen: boolean;
  onToggleOpen: () => void;
  onToggleValue: (value: string) => void;
  onClear: () => void;
}) {
  const isSelected = selected.length > 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={cn(
          'h-8 px-2.5 rounded-md border text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs',
          isSelected
            ? 'bg-primary-subtle border-primary/30 text-primary-subtle-foreground font-semibold'
            : 'border-border/70 bg-background/80 text-muted-foreground hover:text-foreground hover:bg-muted/50 font-medium',
        )}
      >
        <span>{BI_FILTER_DIMENSION_LABELS[dimension]}</span>
        {isSelected && (
          <Badge intent="primary" size="sm" className="ml-0.5 text-[10px] h-4 px-1.5 rounded-full bg-primary text-white border-none">
            {selected.length}
          </Badge>
        )}
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ml-0.5',
            isOpen && 'rotate-180 text-primary-subtle-foreground',
          )}
          aria-hidden
        />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-popover" onClick={onToggleOpen} aria-hidden />
          <div
            role="listbox"
            aria-multiselectable
            aria-label={BI_FILTER_DIMENSION_LABELS[dimension]}
            className="absolute left-0 top-full z-popover mt-1.5 max-h-64 w-56 overflow-y-auto rounded-lg border border-border bg-card p-1.5 shadow-xl animate-in fade-in zoom-in-95 space-y-0.5"
          >
            <div className="px-2 py-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border/50 mb-1 flex justify-between items-center">
              <span>{BI_FILTER_DIMENSION_LABELS[dimension]}</span>
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={onClear}
                  className="text-[10px] font-medium text-destructive-subtle-foreground hover:underline cursor-pointer lowercase"
                >
                  clear
                </button>
              )}
            </div>

            {options.map((option) => {
              const checked = selected.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  onClick={() => onToggleValue(option.value)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer',
                    checked
                      ? 'bg-primary-subtle text-primary-subtle-foreground font-bold'
                      : 'text-foreground hover:bg-muted/60',
                  )}
                >
                  <span className="truncate">{option.label}</span>
                  {checked && <Check className="w-3.5 h-3.5 text-primary-subtle-foreground shrink-0" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function buildOptions(
  transporters: Transporter[],
  routes: Route[],
): Record<BiFilterDimension, Option[]> {
  return {
    routeIds: routes.map((route) => ({ value: route.id, label: route.name })),
    transporterIds: transporters.map((t) => ({ value: t.id, label: t.name })),
    stages: STAGE_KEYS.map((stage) => ({ value: stage, label: STAGE_LABELS[stage] })),
    containerTypes: CONTAINER_TYPES.map((type) => ({ value: type, label: type })),
    cargoTypes: CARGO_TYPES.map((type) => ({ value: type, label: type })),
    delayOwners: DELAY_OWNERS.map((owner) => ({
      value: owner,
      label: DELAY_OWNER_LABELS[owner],
    })),
  } satisfies Record<BiFilterDimension, Option[]>;
}

export type { BiFilters };

