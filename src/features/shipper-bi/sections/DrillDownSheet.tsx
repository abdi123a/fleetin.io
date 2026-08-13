import { useMemo } from 'react';
import { Badge, Sheet, SheetContent, SheetDescription, SheetTitle } from '@/design-system';
import { formatDate } from '@/utils';
import { deriveFacts } from '@/lib/bi/derive';
import { applyDimensionFilters, inPeriod } from '@/lib/bi/aggregate/context';
import {
  DELAY_OWNER_LABELS,
  STAGE_LABELS,
  type BiDataset,
  type BiFilters,
  type DrillDown,
} from '../contracts';
import { formatCurrencyFull, formatDuration, formatVariance } from '../format';

/**
 * The other half of every clickable mark.
 *
 * One sheet serves the whole panel: a `DrillDown` carries either a narrowing to
 * apply on top of the dashboard filters or an explicit list of shipment ids,
 * and this resolves whichever it was given against the same derivation the
 * charts used. That is what keeps the list and the number in agreement — the
 * rows here are literally the rows that produced the figure clicked.
 */

export interface DrillDownSheetProps {
  drillDown: DrillDown | null;
  dataset: BiDataset;
  filters: BiFilters;
  onClose: () => void;
}

export function DrillDownSheet({ drillDown, dataset, filters, onClose }: DrillDownSheetProps) {
  const rows = useMemo(() => {
    if (!drillDown) return [];

    const merged: BiFilters = { ...filters, ...drillDown.filters };
    const facts = applyDimensionFilters(deriveFacts(dataset), merged);

    if (drillDown.shipmentIds) {
      const wanted = new Set(drillDown.shipmentIds);
      return facts.filter((fact) => wanted.has(fact.shipmentId));
    }
    return inPeriod(facts, { from: merged.from, to: merged.to });
  }, [drillDown, dataset, filters]);

  const transporterName = useMemo(
    () => new Map(dataset.transporters.map((t) => [t.id, t.name])),
    [dataset.transporters],
  );
  const routeName = useMemo(
    () => new Map(dataset.routes.map((r) => [r.id, r.name])),
    [dataset.routes],
  );

  return (
    <Sheet open={Boolean(drillDown)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <SheetTitle>{drillDown?.title ?? 'Shipments'}</SheetTitle>
        <SheetDescription>
          {rows.length} shipment{rows.length === 1 ? '' : 's'} behind this figure
        </SheetDescription>

        <div className="mt-4 flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No shipments match this selection.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.slice(0, 200).map((fact) => (
                <li
                  key={fact.shipmentId}
                  className="rounded-card-nested border border-border bg-surface p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {fact.reference}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {routeName.get(fact.routeId) ?? fact.routeId} ·{' '}
                        {transporterName.get(fact.transporterId) ?? fact.transporterId}
                      </p>
                    </div>
                    <Badge
                      intent={
                        fact.deliveryOutcome === 'late'
                          ? 'destructive'
                          : fact.deliveryOutcome === 'on_time'
                            ? 'success'
                            : 'default'
                      }
                      size="sm"
                    >
                      {STAGE_LABELS[fact.currentStage]}
                    </Badge>
                  </div>

                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-4">
                    <Field label="Planned" value={formatDate(fact.plannedDeliveryAt, 'date')} />
                    <Field
                      label="Delivery"
                      value={
                        fact.deliveryVarianceMinutes === undefined
                          ? 'Not delivered'
                          : formatVariance(fact.deliveryVarianceMinutes)
                      }
                    />
                    <Field
                      label="Delay"
                      value={
                        fact.totalDelayMinutes > 0
                          ? `${formatDuration(fact.totalDelayMinutes)}${
                              fact.primaryDelayOwner
                                ? ` · ${DELAY_OWNER_LABELS[fact.primaryDelayOwner]}`
                                : ''
                            }`
                          : 'None'
                      }
                    />
                    <Field label="Cost" value={formatCurrencyFull(fact.costTotal)} />
                  </dl>
                </li>
              ))}
            </ul>
          )}

          {rows.length > 200 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">
              Showing the first 200 of {rows.length}. Narrow the filters or export the full set
              from Reporting.
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium text-foreground">{value}</dd>
    </div>
  );
}
