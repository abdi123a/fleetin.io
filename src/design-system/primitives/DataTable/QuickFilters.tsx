import { ChevronDown } from '@/design-system/icons';

import type { ReactNode } from 'react';

import { Button } from '@/design-system/primitives/Button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { cn } from '@/utils';

import {
  countActiveFilters,
  isFilterValueActive,
  type FilterFieldConfig,
  type FilterState,
  type FilterValue,
} from './types';

/**
 * QuickFilters — the pill filter row FLEETIN list pages carry above the results.
 *
 * Renders each field as a rounded dropdown pill ("Date ▾", "Shipper Project ▾"),
 * followed by the "All Filters" toggle that opens the full `FilterBar` panel and
 * a "Reset" action. Only single-select and multi-select fields make sense as a
 * pill; anything else belongs in the panel, so those are skipped here rather
 * than rendered badly.
 */

const PILL_FIELD_TYPES = new Set(['select', 'status', 'multiSelect', 'tags']);

/** True for field types QuickFilters can render as a pill. */
export function isQuickFilterField(field: FilterFieldConfig): boolean {
  return PILL_FIELD_TYPES.has(field.type) && (field.options?.length ?? 0) > 0;
}

interface FilterPillProps {
  field: FilterFieldConfig;
  value: FilterValue;
  onChange: (value: FilterValue) => void;
}

function FilterPill({ field, value, onChange }: FilterPillProps) {
  const isMulti = field.type === 'multiSelect' || field.type === 'tags';
  const options = field.options ?? [];
  const active = isFilterValueActive(value);

  const selected = isMulti ? (Array.isArray(value) ? (value as string[]) : []) : [];
  const single = typeof value === 'string' ? value : '';

  const label = isMulti
    ? selected.length > 0
      ? `${field.label} (${selected.length})`
      : field.label
    : (options.find((option) => option.value === single)?.label ?? field.label);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          shape="pill"
          trailingIcon={<ChevronDown />}
          className={cn(active && 'border-primary text-primary')}
        >
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        {isMulti ? (
          options.map((option) => {
            const isSelected = selected.includes(option.value);
            return (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={isSelected}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() =>
                  onChange(
                    isSelected ? selected.filter((entry) => entry !== option.value) : [...selected, option.value],
                  )
                }
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            );
          })
        ) : (
          <DropdownMenuRadioGroup value={single} onValueChange={(next) => onChange(next === single ? '' : next)}>
            {options.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface QuickFiltersProps {
  fields: FilterFieldConfig[];
  value: FilterState;
  onChange: (next: FilterState) => void;
  /** Opens the full FilterBar panel. Renders the "All Filters" button when supplied. */
  onOpenAllFilters?: () => void;
  allFiltersOpen?: boolean;
  onReset?: () => void;
  /** Right-aligned slot — the "Assigned to me" / "Created by me" switches on FLEETIN list pages. */
  toggles?: ReactNode;
  /** Leading "Filters" caption. Pass null to omit. */
  label?: ReactNode;
  className?: string;
}

export function QuickFilters({
  fields,
  value,
  onChange,
  onOpenAllFilters,
  allFiltersOpen = false,
  onReset,
  toggles,
  label = 'Filters',
  className,
}: QuickFiltersProps) {
  const pillFields = fields.filter(isQuickFilterField);
  const activeCount = countActiveFilters(value);

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {label && <span className="type-body-sm text-muted-foreground">{label}</span>}

        {pillFields.map((field) => (
          <FilterPill
            key={field.id}
            field={field}
            value={value[field.id]}
            onChange={(next) => onChange({ ...value, [field.id]: next })}
          />
        ))}

        {onOpenAllFilters && (
          <Button
            variant={allFiltersOpen ? 'subtle' : 'outline'}
            size="sm"
            shape="pill"
            onClick={onOpenAllFilters}
          >
            All Filters
            {activeCount > 0 && ` (${activeCount})`}
          </Button>
        )}

        {onReset && (
          <Button variant="ghost" size="sm" onClick={onReset} disabled={activeCount === 0}>
            Reset
          </Button>
        )}
      </div>

      {toggles && <div className="flex flex-wrap items-center gap-5">{toggles}</div>}
    </div>
  );
}
