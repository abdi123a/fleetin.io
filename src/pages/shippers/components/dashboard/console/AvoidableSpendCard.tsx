import { useMemo } from 'react';
import { Card, IconChip } from '@/design-system';
import { Wallet } from '@/design-system/icons';
import type { ShipperShipmentRow } from '@/features/shipper-bi';
import { formatMetric } from '@/features/shipper-bi/format';
import { cn } from '@/utils';
import { PANEL_SURFACE } from './PanelHeader';

/**
 * What the window cost, split by how the cargo moved — and how much of it was
 * detention.
 *
 * Total spend is the figure a shipper asks for first. Underneath: containers
 * vs bulk vs other, then detention as the avoidable slice sitting on top of
 * that total (not a fourth mode — it is already inside container spend).
 */

export interface AvoidableSpendCardProps {
  rows: ShipperShipmentRow[];
  onViewAll?: () => void;
  className?: string;
}

type SpendMode = 'containers' | 'bulk' | 'other';

const MODE_META: Record<
  SpendMode,
  { label: string; bar: string; dot: string }
> = {
  containers: {
    label: 'Containers',
    bar: 'bg-primary',
    dot: 'bg-primary',
  },
  bulk: {
    label: 'Bulk',
    bar: 'bg-accent-bold',
    dot: 'bg-accent-bold',
  },
  other: {
    label: 'Other',
    bar: 'bg-accent-bold/35',
    dot: 'bg-accent-bold/35',
  },
};

/** Bulk / bulky goods — cargo type wins over container number. */
function isBulkRow(row: ShipperShipmentRow): boolean {
  const cargo = row.cargoType?.toLowerCase() ?? '';
  return cargo.includes('bulk');
}

function spendMode(row: ShipperShipmentRow): SpendMode {
  if (isBulkRow(row)) return 'bulk';
  if (row.containerNo) return 'containers';
  return 'other';
}

export function AvoidableSpendCard({ rows, onViewAll, className }: AvoidableSpendCardProps) {
  const model = useMemo(() => {
    const byMode: Record<SpendMode, number> = {
      containers: 0,
      bulk: 0,
      other: 0,
    };
    let total = 0;
    let detention = 0;

    for (const row of rows) {
      total += row.cost;
      byMode[spendMode(row)] += row.cost;
      detention += row.costByType.detention ?? 0;
    }

    // Always surface containers, bulk, and other — even at zero — so the
    // shipper can see the full mode split, not only the modes that spent.
    const ranked = (['containers', 'bulk', 'other'] as const).map((mode) => ({
      mode,
      amount: byMode[mode],
    }));

    return {
      total,
      ranked,
      detention,
      detentionShare: total > 0 ? detention / total : 0,
    };
  }, [rows]);

  const isEmpty = model.total <= 0;
  const barSegments = model.ranked.filter((entry) => entry.amount > 0);

  return (
    <Card
      variant="default"
      padding="none"
      className={cn('h-full flex flex-col justify-between gap-5 border p-6', PANEL_SURFACE, className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="type-body-sm font-medium text-muted-foreground">Total spend</p>
          <p className="type-display mt-2.5 text-foreground tabular-nums">
            {formatMetric(model.total, 'currency')}
          </p>
          <p className="type-body-xs mt-1.5 text-muted-foreground">
            Freight and charges this window
          </p>
        </div>

        <IconChip icon={Wallet} className="shadow-sm" />
      </div>

      <div className="flex flex-col gap-3 border-t border-border-subtle/60 pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="type-body-xs text-muted-foreground">By mode</p>
          {onViewAll ? (
            <button
              type="button"
              onClick={onViewAll}
              className="type-body-xs shrink-0 text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Breakdown
            </button>
          ) : null}
        </div>

        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
          {isEmpty ? (
            <div className="h-full w-full rounded-full bg-muted" />
          ) : (
            barSegments.map((entry) => (
              <div
                key={entry.mode}
                className={cn('h-full', MODE_META[entry.mode].bar)}
                style={{ width: `${(entry.amount / model.total) * 100}%` }}
                title={`${MODE_META[entry.mode].label}: ${formatMetric(entry.amount, 'currency')}`}
              />
            ))
          )}
        </div>

        <ul className="flex flex-col gap-1">
          {model.ranked.map((entry) => {
            const share = model.total > 0 ? (entry.amount / model.total) * 100 : 0;
            return (
              <li
                key={entry.mode}
                className="flex items-center justify-between gap-2 type-body-xs"
              >
                <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                  <span
                    className={cn('size-1.5 shrink-0 rounded-full', MODE_META[entry.mode].dot)}
                    aria-hidden
                  />
                  <span className="truncate">{MODE_META[entry.mode].label}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-foreground">
                  {formatMetric(entry.amount, 'currency')}
                  <span className="ml-1.5 font-medium text-muted-foreground">
                    · {share.toFixed(0)}%
                  </span>
                </span>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-between gap-2 border-t border-border-subtle/60 pt-3 type-body-xs">
          <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
            <span className="size-1.5 shrink-0 rounded-full bg-destructive" aria-hidden />
            <span className="truncate font-medium">Detention</span>
          </span>
          <span
            className={cn(
              'shrink-0 font-semibold tabular-nums',
              model.detention > 0 ? 'text-destructive-subtle-foreground' : 'text-foreground',
            )}
          >
            {formatMetric(model.detention, 'currency')}
            <span className="ml-1.5 font-medium text-muted-foreground">
              · {(model.detentionShare * 100).toFixed(0)}%
            </span>
          </span>
        </div>
      </div>
    </Card>
  );
}
