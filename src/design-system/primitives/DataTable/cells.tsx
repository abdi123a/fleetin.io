import { MoreHorizontal } from '@/design-system/icons';

import { IconButton } from '@/design-system/primitives/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { DocumentAvatar, UserAvatar } from '@/design-system/primitives/Display/Identity';
import { LinearProgress, type ProgressStatus } from '@/design-system/primitives/Display/Indicators';
import { StatusBadge, type DomainStatus } from '@/design-system/primitives/Display/Status';
import { Labels, Tag } from '@/design-system/primitives/Display/Tags';
import { cn, formatCurrency, formatDate, formatFileSize, type DateFormat } from '@/utils';

import type { RowAction } from './types';

/**
 * Reusable cell renderers for `EnterpriseDataTable` column definitions.
 *
 * These compose existing Display primitives (`StatusBadge`, `UserAvatar`,
 * `LinearProgress`, `Tag`…) into the shapes a data table cell actually needs —
 * truncation, muted fallbacks for empty values, tabular numerals. A column
 * `cell` renderer is just a function, so these are optional: any React node
 * works as a cell, including a value straight from `@/design-system`.
 */

const MUTED_DASH = <span className="text-muted-foreground">—</span>;

/* ---------------------------------------------------------------------------
 * StatusCell
 * ------------------------------------------------------------------------- */

export interface StatusCellProps {
  status?: DomainStatus | null;
  label?: string;
}

export function StatusCell({ status, label }: StatusCellProps) {
  if (!status) return MUTED_DASH;
  return <StatusBadge status={status} label={label} size="sm" />;
}

/* ---------------------------------------------------------------------------
 * AvatarCell — person identity (avatar + name + optional subtitle)
 * ------------------------------------------------------------------------- */

export interface AvatarCellProps {
  name: string;
  subtitle?: string;
  src?: string;
  online?: boolean | null;
}

export function AvatarCell({ name, subtitle, src, online }: AvatarCellProps) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <UserAvatar name={name} src={src} size="sm" online={online} />
      <div className="min-w-0">
        <p className="truncate type-body-sm font-medium text-foreground">{name}</p>
        {subtitle && <p className="truncate type-body-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * ProgressCell
 * ------------------------------------------------------------------------- */

export interface ProgressCellProps {
  value: number;
  status?: ProgressStatus;
  showValue?: boolean;
  width?: number;
}

export function ProgressCell({ value, status = 'default', showValue = true, width = 128 }: ProgressCellProps) {
  return (
    <div style={{ width }}>
      <LinearProgress value={value} status={status} showValue={showValue} size="sm" />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * DateCell
 * ------------------------------------------------------------------------- */

export interface DateCellProps {
  value?: string | Date | null;
  variant?: DateFormat;
}

export function DateCell({ value, variant = 'date' }: DateCellProps) {
  return <span className="tabular-nums text-foreground">{formatDate(value, variant)}</span>;
}

/* ---------------------------------------------------------------------------
 * CurrencyCell
 * ------------------------------------------------------------------------- */

export interface CurrencyCellProps {
  value?: number | null;
  currency?: string;
  align?: 'left' | 'right';
}

export function CurrencyCell({ value, currency = 'USD', align = 'right' }: CurrencyCellProps) {
  return (
    <span
      className={cn('block tabular-nums font-medium text-foreground', align === 'right' && 'text-right')}
    >
      {formatCurrency(value, currency)}
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * FileCell
 * ------------------------------------------------------------------------- */

export interface FileCellProps {
  name: string;
  size?: number | null;
  type?: string;
}

export function FileCell({ name, size, type }: FileCellProps) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <DocumentAvatar type={type} size="sm" />
      <div className="min-w-0">
        <p className="truncate type-body-sm font-medium text-foreground">{name}</p>
        {size !== null && size !== undefined && (
          <p className="type-body-xs text-muted-foreground">{formatFileSize(size)}</p>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * TagsCell
 * ------------------------------------------------------------------------- */

export interface TagsCellProps {
  items: string[];
  max?: number;
}

export function TagsCell({ items, max = 2 }: TagsCellProps) {
  if (items.length === 0) return MUTED_DASH;
  return <Labels max={max} items={items.map((item) => <Tag key={item}>{item}</Tag>)} />;
}

/* ---------------------------------------------------------------------------
 * ActionsCell — row-level actions menu
 * ------------------------------------------------------------------------- */

export interface ActionsCellProps<TData> {
  row: TData;
  actions: RowAction<TData>[];
}

export function ActionsCell<TData>({ row, actions }: ActionsCellProps<TData>) {
  const visible = actions.filter((action) => !action.isHidden?.(row));
  if (visible.length === 0) return null;

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton aria-label="Row actions" variant="ghost" size="sm">
            <MoreHorizontal />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {visible.map((action) => (
            <DropdownMenuItem
              key={action.id}
              variant={action.variant === 'destructive' ? 'destructive' : 'default'}
              disabled={action.isDisabled?.(row)}
              onSelect={() => action.onSelect(row)}
            >
              {action.icon}
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
