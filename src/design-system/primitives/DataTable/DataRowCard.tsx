import { flexRender, type Cell, type Row } from '@tanstack/react-table';

import { Card } from '@/design-system/primitives/Layout';
import { CardDataField } from '@/design-system/primitives/Layout/CardDataField';
import { CornerBadge } from '@/design-system/primitives/Layout/CornerBadge';
import { cn } from '@/utils';

import {
  ACTIONS_COLUMN_ID,
  EXPAND_COLUMN_ID,
  resolveColumnLabel,
  SELECT_COLUMN_ID,
  type CardBadge,
} from './types';

/**
 * DataRowCard — one record rendered as a FLEETIN list-page row card.
 *
 * The generic, column-driven equivalent of `ShipmentCard`: the same
 * `ColumnDef[]` that drives the table layout drives this one, with
 * `meta.cardSlot` deciding which panel each column lands in and
 * `meta.icon` / `meta.iconTheme` styling the field. A module therefore
 * switches a list page between a dense table and the card layout with one
 * prop, and never writes a second set of column definitions.
 */

export interface DataRowCardProps<TData> {
  row: Row<TData>;
  /** Corner tags flush in the card's top-left — Shipment#, Booking#, … */
  badges?: CardBadge[];
  onClick?: (row: TData) => void;
  className?: string;
}

function isSynthetic(id: string): boolean {
  return id === SELECT_COLUMN_ID || id === EXPAND_COLUMN_ID || id === ACTIONS_COLUMN_ID;
}

function renderCell<TData>(cell: Cell<TData, unknown>) {
  return flexRender(cell.column.columnDef.cell, cell.getContext());
}

export function DataRowCard<TData>({ row, badges, onClick, className }: DataRowCardProps<TData>) {
  const cells = row.getVisibleCells();

  const selectCell = cells.find((cell) => cell.column.id === SELECT_COLUMN_ID);
  const expandCell = cells.find((cell) => cell.column.id === EXPAND_COLUMN_ID);
  const actionsCell = cells.find((cell) => cell.column.id === ACTIONS_COLUMN_ID);

  const dataCells = cells.filter((cell) => !isSynthetic(cell.column.id));

  const leadCells = dataCells.filter((cell) => cell.column.columnDef.meta?.cardSlot === 'lead');
  const trailingCells = dataCells.filter((cell) => cell.column.columnDef.meta?.cardSlot === 'trailing');

  // Sub-label columns are consumed by their parent field rather than rendered on their own.
  const subLabelByParent = new Map<string, Cell<TData, unknown>>();
  for (const cell of dataCells) {
    const parentId = cell.column.columnDef.meta?.cardSubLabelOf;
    if (parentId) subLabelByParent.set(parentId, cell);
  }

  const fieldCells = dataCells.filter((cell) => {
    const meta = cell.column.columnDef.meta;
    if (meta?.cardSubLabelOf) return false;
    if (meta?.cardSlot === 'hidden') return false;
    return meta?.cardSlot === undefined || meta.cardSlot === 'field';
  });

  const hasLead = leadCells.length > 0 || Boolean(badges?.length);
  const hasTrailing = trailingCells.length > 0 || Boolean(actionsCell);

  const hasStackedBadges = Boolean(badges && badges.length > 1);

  return (
    <Card
      onClick={onClick ? () => onClick(row.original) : undefined}
      className={cn(
        'relative overflow-hidden rounded-lg border border-border/80 bg-surface text-foreground shadow-2xs hover:shadow-md transition duration-200 group/card',
        onClick && 'cursor-pointer hover:border-primary/40',
        row.getIsSelected() && 'border-primary/50 bg-primary/5',
        className,
      )}
    >
      {badges && badges.length > 0 && (
        <div className="absolute left-0 top-0 z-10 flex select-none flex-col items-start">
          {badges.map((badge, index) => (
            <CornerBadge
              key={badge.label}
              label={badge.label}
              intent={badge.intent ?? (index === 0 ? 'teal' : 'orange')}
              position={index === 0 ? 'top' : 'second'}
            />
          ))}
        </div>
      )}

      <div
        className={cn(
          'grid min-h-[136px] grid-cols-1 items-stretch',
          hasLead && hasTrailing && 'md:grid-cols-12',
          hasLead && !hasTrailing && 'md:grid-cols-12',
          !hasLead && hasTrailing && 'md:grid-cols-12',
        )}
      >
        {hasLead && (
          <div
            className={cn(
              'flex flex-col justify-center gap-3 border-b border-border/70 bg-surface-sunken/50 p-4 sm:p-5 md:border-b-0 md:border-r transition-colors group-hover/card:bg-surface-sunken/80',
              hasTrailing ? 'md:col-span-4 lg:col-span-3' : 'md:col-span-4',
              badges && badges.length > 0 && (hasStackedBadges ? 'pt-16 sm:pt-16 md:pt-16' : 'pt-12 sm:pt-12 md:pt-12'),
            )}
          >
            {selectCell && <div className="mb-1">{renderCell(selectCell)}</div>}
            {leadCells.map((cell) => (
              <div key={cell.id} className="min-w-0">
                {renderCell(cell)}
              </div>
            ))}
          </div>
        )}

        <div
          className={cn(
            'flex flex-col justify-center gap-4 p-4 sm:p-5',
            hasLead && hasTrailing && 'md:col-span-8 lg:col-span-6 xl:col-span-7',
            hasLead && !hasTrailing && 'md:col-span-8 lg:col-span-8',
            !hasLead && hasTrailing && 'md:col-span-8 lg:col-span-9',
            !hasLead && !hasTrailing && 'md:col-span-12',
          )}
        >
          {!hasLead && selectCell && <div className="mb-1">{renderCell(selectCell)}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-y-4 gap-x-8">
            {fieldCells.map((cell) => {
              const meta = cell.column.columnDef.meta;
              const subLabelCell = subLabelByParent.get(cell.column.id);
              return (
                <CardDataField
                  key={cell.id}
                  icon={meta?.icon}
                  iconTheme={meta?.iconTheme ?? (meta?.icon ? 'teal' : 'none')}
                  value={renderCell(cell)}
                  label={subLabelCell ? renderCell(subLabelCell) : resolveColumnLabel(cell.column)}
                />
              );
            })}
          </div>
        </div>

        {hasTrailing && (
          <div
            className={cn(
              'flex flex-row lg:flex-col justify-between items-center lg:items-end gap-3 border-t border-border/70 bg-surface/90 p-4 sm:p-5 lg:border-t-0 lg:border-l',
              hasLead ? 'md:col-span-12 lg:col-span-3 xl:col-span-2' : 'md:col-span-12 lg:col-span-3',
            )}
          >
            {trailingCells.map((cell) => (
              <div key={cell.id} className="flex flex-col items-end gap-1.5 min-w-0 max-w-full">
                {renderCell(cell)}
              </div>
            ))}
            <div className="flex items-center gap-1.5 shrink-0">
              {expandCell && renderCell(expandCell)}
              {actionsCell && renderCell(actionsCell)}
            </div>
          </div>
        )}

        {!hasTrailing && (expandCell || actionsCell) && (
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5 shrink-0">
            {expandCell && renderCell(expandCell)}
            {actionsCell && renderCell(actionsCell)}
          </div>
        )}
      </div>
    </Card>
  );
}
