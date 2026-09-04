import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { SearchField } from '@/components';
import { Button, Card, Dialog, DialogContent, DialogFooter, DialogHeader, IconChip, Skeleton } from '@/design-system';
import { Check, Package, Search } from '@/design-system/icons';
import { useAllShipmentsRaw, useUpdateShipmentRaw } from '@/features/shipments/api/queries';
import type { ShipmentRecord } from '@/features/shipments/api/shipmentsService';
import { fmtDjf, fmtDocDate, fromMinorUnits } from '@/lib/finance';
import { cn } from '@/utils';

/**
 * Puts existing shipments onto a project.
 *
 * A project groups work that is already in the system — it is a commercial
 * agreement laid over shipments, not a thing shipments are created inside — so
 * this attaches rather than creates. Multi-select, because an operator setting
 * a contract up is doing a month of work at once, and one-at-a-time would mean
 * twenty round trips.
 *
 * Only the client's OWN shipments are offered. A project belongs to one
 * shipper, and letting another client's job be attached would put their money
 * on somebody else's contract totals.
 */
export function AddShipmentsDialog({
  open,
  onOpenChange,
  projectId,
  shipperId,
  shipperName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  shipperId: string;
  /** The project's client — NAMED, so the scoping is visible rather than assumed. */
  shipperName: string;
}) {
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const { data: shipments = [], isLoading } = useAllShipmentsRaw({});
  const update = useUpdateShipmentRaw();
  const queryClient = useQueryClient();

  const available = useMemo(() => {
    const term = search.trim().toLowerCase();
    return shipments
      .filter(
        (shipment) =>
          shipment.shipperId === shipperId &&
          /* Already on this project, or on another one — either way not a
             choice. Moving a shipment between projects is a deliberate act on
             the shipment, not something an "add" list should do silently. */
          shipment.projectId == null &&
          !['Cancelled', 'Failed'].includes(shipment.status),
      )
      .filter((shipment) =>
        term
          ? shipment.reference.toLowerCase().includes(term) ||
            shipment.pickupLocationName.toLowerCase().includes(term) ||
            shipment.deliveryLocationName.toLowerCase().includes(term)
          : true,
      )
      .sort((a, b) => b.scheduledPickupTime.localeCompare(a.scheduledPickupTime));
  }, [shipments, shipperId, search]);

  const chosenValue = useMemo(
    () =>
      available
        .filter((shipment) => picked.has(shipment.id))
        .reduce(
          (sum, shipment) =>
            sum +
            (shipment.clientRateMinorUnits
              ? fromMinorUnits(shipment.clientRateMinorUnits, shipment.clientRateCurrency ?? 'DJF')
              : 0),
          0,
        ),
    [available, picked],
  );

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function close() {
    setPicked(new Set());
    setSearch('');
    onOpenChange(false);
  }

  async function attach() {
    /* Sequential rather than parallel: these are PATCHes against one project's
       totals, and a burst of twenty concurrent writes is how a server ends up
       recomputing the same aggregate twenty times. */
    for (const id of picked) {
      await update.mutateAsync({ id, payload: { projectId } });
    }
    /* The shipment mutation invalidates shipments, which is all it can know
       about. Attaching one to a project also changes that PROJECT's totals and
       its shipment list, and those come from a different query — without this
       the writes land and the page it was done from shows nothing. */
    await queryClient.invalidateQueries({ queryKey: ['projects'] });
    close();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader title="Add shipments" className="shrink-0">
          {/*
            The client, named.

            The list was already scoped to the project's shipper — a project
            belongs to one client, and another client's job on its totals would
            be somebody else's money — but nothing on screen said so, and an
            operator looking at five references has no way to tell a filtered
            list from the whole book. Saying it is the fix; the filter was
            never the problem.
          */}
          <p className="text-sm text-muted-foreground">
            Only <span className="font-medium text-foreground">{shipperName}</span>&rsquo;s shipments,
            and only those not already on a project. Their value counts towards its totals straight
            away.
          </p>
        </DialogHeader>

        <div className="shrink-0 border-b border-border-subtle px-5 py-3 sm:px-6">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Reference or route"
            matched={available.length}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2 sm:px-6">
          {isLoading ? (
            <div className="space-y-2 py-2">
              {[0, 1, 2, 3].map((n) => (
                <Skeleton key={n} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : available.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <IconChip icon={Search} size={44} tint="neutral" />
              <p className="text-sm font-medium text-foreground">Nothing left to add</p>
              <p className="max-w-[22rem] text-sm text-muted-foreground">
                Every {shipperName} shipment is already on a project.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5 py-1">
              {available.map((shipment) => (
                <li key={shipment.id}>
                  <ShipmentOption
                    shipment={shipment}
                    chosen={picked.has(shipment.id)}
                    onToggle={() => toggle(shipment.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {update.isError ? (
          <p className="shrink-0 px-5 pb-2 text-sm text-destructive sm:px-6">
            {(update.error as Error).message}
          </p>
        ) : null}

        <DialogFooter className="shrink-0 border-t border-border-subtle">
          <span className="mr-auto text-sm text-muted-foreground">
            {picked.size > 0 ? (
              <>
                <span className="font-semibold text-foreground">{picked.size}</span> chosen ·{' '}
                <span className="font-semibold text-foreground">{fmtDjf(chosenValue)}</span>
              </>
            ) : (
              'None chosen'
            )}
          </span>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button disabled={picked.size === 0 || update.isPending} onClick={attach}>
            {update.isPending ? 'Adding…' : `Add ${picked.size || ''}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShipmentOption({
  shipment,
  chosen,
  onToggle,
}: {
  shipment: ShipmentRecord;
  chosen: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={chosen}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
        chosen ? 'border-primary bg-primary-subtle' : 'border-border hover:border-border-strong hover:bg-muted',
      )}
    >
      {/* The tick replaces the glyph rather than sitting beside it: a row that
          is chosen should look chosen at a glance, not carry a second mark. */}
      <IconChip
        icon={chosen ? Check : Package}
        size={36}
        tint={chosen ? 'teal' : 'neutral'}
        className="shrink-0"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{shipment.reference}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {shipment.pickupLocationName} → {shipment.deliveryLocationName}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-semibold tabular-nums text-foreground">
          {shipment.clientRateMinorUnits
            ? fmtDjf(fromMinorUnits(shipment.clientRateMinorUnits, shipment.clientRateCurrency ?? 'DJF'))
            : '—'}
        </span>
        <span className="block text-[11px] text-muted-foreground">
          {fmtDocDate(shipment.scheduledPickupTime)}
        </span>
      </span>
    </button>
  );
}

/** Re-exported so the project page can show an empty state that offers the action. */
export { Card as ProjectCard };
