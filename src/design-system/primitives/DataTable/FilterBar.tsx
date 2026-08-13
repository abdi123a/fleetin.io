import type { ChangeEvent } from 'react';

import { Button } from '@/design-system/primitives/Button';
import { Chip, Tag } from '@/design-system/primitives/Display/Tags';
import { Input } from '@/design-system/primitives/Input';
import { DatePicker } from '@/design-system/primitives/Pickers';
import { Checkbox, Select, Switch } from '@/design-system/primitives/SelectionControls';
import { Tooltip } from '@/design-system/primitives/Tooltip';
import { cn } from '@/utils';

import {
  countActiveFilters,
  isFilterValueActive,
  type DateRangeValue,
  type FilterFieldConfig,
  type FilterFieldType,
  type FilterState,
  type FilterValue,
  type NumberRangeValue,
} from './types';

/**
 * FilterBar — the standard advanced-filter panel.
 *
 * Renders one control per `FilterFieldConfig`, keyed by `field.id` — that id
 * doubles as the key in `FilterState` and, by convention, the column id it
 * filters. `EnterpriseDataTable` wires a `FilterBar`'s output into
 * `columnFilters` for fields whose id matches a column, and leaves anything
 * else (server-only filters) for the caller to read out of `value` directly.
 */

function emptyValueForType(type: FilterFieldType): FilterValue {
  switch (type) {
    case 'boolean':
    case 'checkbox':
      return false;
    case 'multiSelect':
    case 'tags':
      return [];
    case 'numberRange':
    case 'dateRange':
      return [null, null];
    case 'text':
    case 'search':
    case 'select':
    case 'status':
    case 'date':
      return '';
  }
}

interface FilterFieldControlProps {
  field: FilterFieldConfig;
  value: FilterValue;
  onChange: (value: FilterValue) => void;
}

function FilterFieldControl({ field, value, onChange }: FilterFieldControlProps) {
  switch (field.type) {
    case 'text':
    case 'search': {
      const current = typeof value === 'string' ? value : '';
      return (
        <Input
          inputSize="sm"
          aria-label={field.label}
          placeholder={field.placeholder ?? `Filter by ${field.label.toLowerCase()}`}
          value={current}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
          isClearable
          onClear={() => onChange('')}
        />
      );
    }

    case 'select': {
      const current = typeof value === 'string' ? value : '';
      return (
        <Select
          selectSize="sm"
          aria-label={field.label}
          placeholder={field.placeholder ?? 'All'}
          value={current}
          onChange={(event) => onChange(event.target.value)}
          options={field.options ?? []}
        />
      );
    }

    case 'status': {
      const current = typeof value === 'string' ? value : '';
      const options = field.options ?? [];
      return (
        <div role="group" aria-label={field.label} className="flex flex-wrap gap-1.5">
          {options.map((option) => (
            <Chip
              key={option.value}
              selected={current === option.value}
              onClick={() => onChange(current === option.value ? '' : option.value)}
            >
              {option.label}
            </Chip>
          ))}
        </div>
      );
    }

    case 'multiSelect':
    case 'tags': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      const options = field.options ?? [];
      return (
        <div role="group" aria-label={field.label} className="flex flex-wrap gap-1.5">
          {options.map((option) => {
            const isSelected = selected.includes(option.value);
            return (
              <Chip
                key={option.value}
                selected={isSelected}
                onClick={() =>
                  onChange(
                    isSelected
                      ? selected.filter((entry) => entry !== option.value)
                      : [...selected, option.value],
                  )
                }
              >
                {option.label}
              </Chip>
            );
          })}
        </div>
      );
    }

    case 'boolean': {
      return <Switch checked={value === true} onChange={(event) => onChange(event.target.checked)} label={field.label} />;
    }

    case 'checkbox': {
      return <Checkbox checked={value === true} onChange={(event) => onChange(event.target.checked)} label={field.label} />;
    }

    case 'date': {
      const current = typeof value === 'string' ? value : undefined;
      return (
        <DatePicker
          value={current}
          placeholder={field.placeholder ?? 'Select date'}
          onChange={(dateString) => onChange(dateString.length > 0 ? dateString : '')}
        />
      );
    }

    case 'dateRange': {
      const range: DateRangeValue = Array.isArray(value) ? (value as DateRangeValue) : [null, null];
      const setRange = (next: DateRangeValue) => onChange(next);
      return (
        <div className="flex items-center gap-1.5">
          <DatePicker value={range[0] ?? undefined} placeholder="From" onChange={(d) => setRange([d.length > 0 ? d : null, range[1]])} />
          <span className="shrink-0 text-muted-foreground">–</span>
          <DatePicker value={range[1] ?? undefined} placeholder="To" onChange={(d) => setRange([range[0], d.length > 0 ? d : null])} />
        </div>
      );
    }

    case 'numberRange': {
      const range: NumberRangeValue = Array.isArray(value) ? (value as NumberRangeValue) : [null, null];
      const setRange = (next: NumberRangeValue) => onChange(next);
      return (
        <div className="flex items-center gap-1.5">
          <Input
            inputSize="sm"
            type="number"
            inputMode="numeric"
            className="w-24"
            aria-label={`${field.label} minimum`}
            placeholder="Min"
            value={range[0] ?? ''}
            onChange={(event) => setRange([event.target.value === '' ? null : Number(event.target.value), range[1]])}
          />
          <span className="shrink-0 text-muted-foreground">–</span>
          <Input
            inputSize="sm"
            type="number"
            inputMode="numeric"
            className="w-24"
            aria-label={`${field.label} maximum`}
            placeholder="Max"
            value={range[1] ?? ''}
            onChange={(event) => setRange([range[0], event.target.value === '' ? null : Number(event.target.value)])}
          />
        </div>
      );
    }
  }
}

/* ---------------------------------------------------------------------------
 * Active filter chips
 * ------------------------------------------------------------------------- */

interface ActiveChip {
  key: string;
  fieldId: string;
  /** Present only for multi-value fields — removing the chip removes just this entry. */
  entryValue?: string;
  label: string;
}

function describeSingleValue(field: FilterFieldConfig, value: FilterValue): string | null {
  switch (field.type) {
    case 'boolean':
    case 'checkbox':
      return value === true ? field.label : null;
    case 'dateRange': {
      const [from, to] = value as DateRangeValue;
      return `${field.label}: ${from ?? '…'} → ${to ?? '…'}`;
    }
    case 'numberRange': {
      const [min, max] = value as NumberRangeValue;
      return `${field.label}: ${min ?? '…'} – ${max ?? '…'}`;
    }
    case 'select':
    case 'status':
    case 'date':
    case 'text':
    case 'search': {
      if (typeof value !== 'string' || value.length === 0) return null;
      const option = field.options?.find((entry) => entry.value === value);
      return `${field.label}: ${option?.label ?? value}`;
    }
    default:
      return null;
  }
}

function buildActiveChips(fields: FilterFieldConfig[], state: FilterState): ActiveChip[] {
  const chips: ActiveChip[] = [];

  for (const field of fields) {
    const value = state[field.id];
    if (!isFilterValueActive(value)) continue;

    if (field.type === 'multiSelect' || field.type === 'tags') {
      const items = Array.isArray(value) ? (value as string[]) : [];
      for (const entry of items) {
        if (!entry) continue;
        const option = field.options?.find((candidate) => candidate.value === entry);
        chips.push({
          key: `${field.id}:${entry}`,
          fieldId: field.id,
          entryValue: entry,
          label: `${field.label}: ${option?.label ?? entry}`,
        });
      }
      continue;
    }

    const label = describeSingleValue(field, value);
    if (label) chips.push({ key: field.id, fieldId: field.id, label });
  }

  return chips;
}

/* ---------------------------------------------------------------------------
 * FilterBar
 * ------------------------------------------------------------------------- */

export interface FilterBarProps {
  fields: FilterFieldConfig[];
  value: FilterState;
  onChange: (next: FilterState) => void;
  /** Custom clear handler. Defaults to resetting every field to its empty value. */
  onClear?: () => void;
  /** Reverts to a previously saved / default state distinct from "empty". */
  onReset?: () => void;
  layout?: 'inline' | 'panel';
  className?: string;
}

export function FilterBar({ fields, value, onChange, onClear, onReset, layout = 'panel', className }: FilterBarProps) {
  const activeCount = countActiveFilters(value);
  const chips = buildActiveChips(fields, value);

  const setFieldValue = (id: string, next: FilterValue) => {
    onChange({ ...value, [id]: next });
  };

  const handleClear = () => {
    if (onClear) {
      onClear();
      return;
    }
    const cleared: FilterState = {};
    for (const field of fields) cleared[field.id] = emptyValueForType(field.type);
    onChange(cleared);
  };

  const removeChip = (chip: ActiveChip) => {
    const field = fields.find((entry) => entry.id === chip.fieldId);
    if (!field) return;

    if (chip.entryValue !== undefined) {
      const current = Array.isArray(value[chip.fieldId]) ? (value[chip.fieldId] as string[]) : [];
      setFieldValue(chip.fieldId, current.filter((entry) => entry !== chip.entryValue));
      return;
    }

    setFieldValue(chip.fieldId, emptyValueForType(field.type));
  };

  return (
    <div className={cn('space-y-3 rounded-card border border-border bg-surface p-4', className)}>
      <div
        className={cn(
          'gap-3',
          layout === 'inline'
            ? 'flex flex-wrap items-end'
            : 'grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
        )}
      >
        {fields.map((field) => (
          <div key={field.id} className="min-w-0 space-y-1.5">
            {field.type !== 'boolean' && field.type !== 'checkbox' && (
              <span className="type-label block text-muted-foreground">{field.label}</span>
            )}
            <FilterFieldControl
              field={field}
              value={value[field.id]}
              onChange={(next) => setFieldValue(field.id, next)}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <div className="flex min-h-8 flex-wrap items-center gap-1.5">
          {chips.length === 0 ? (
            <span className="type-body-xs text-muted-foreground">No filters applied</span>
          ) : (
            chips.map((chip) => (
              <Tag key={chip.key} intent="primary" onRemove={() => removeChip(chip)}>
                {chip.label}
              </Tag>
            ))
          )}
        </div>

        <div className="flex items-center gap-2">
          <Tooltip content="Coming soon">
            <span>
              <Button variant="ghost" size="sm" disabled>
                Save filter
              </Button>
            </span>
          </Tooltip>
          {onReset && (
            <Button variant="ghost" size="sm" onClick={onReset}>
              Reset
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleClear} disabled={activeCount === 0}>
            Clear filters{activeCount > 0 ? ` (${activeCount})` : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}
