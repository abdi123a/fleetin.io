import { useMemo } from 'react';

import {
  Card,
  EmptyState,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '@/design-system';
import { Truck } from '@/design-system/icons';
import { PageHeader } from '@/components';
import type { TransporterCycleStats } from '@/types/emptyReturn';
import { selectTransporterStats, useEmptyReturnStore } from '@/stores/emptyReturn.store';
import { useAvailableEmpties, useCycles } from '@/features/empty-returns/api/queries';
import { cycleToRow, emptyBookingToRow } from '@/features/empty-returns/mappers';

import { CompanyName, Mono } from './components/atoms';

/**
 * Cycle throughput per carrier — the module's one league table.
 *
 * Every other view in this module answers "what is happening to this box".
 * This one answers "which carrier is actually closing loops", which is a
 * question you only ever ask by comparing straight down a column: who runs the
 * longest chains, whose returns land before the deadline, who keeps ending up
 * with a standalone. So from `md` up it is a real table, not eight cards — and
 * it is the one list in the module whose rows do not open anything, because a
 * carrier is not a record you act on from here.
 *
 * Below `md` the columns are given up rather than faked. Eight of them on a
 * phone can only be a sideways scroll, and that scroll takes the carrier's name
 * away with it — leaving bare figures attached to nobody, which is a worse
 * answer than no comparison at all. There the same seven figures are labelled
 * in place on a card per carrier: the per-carrier read survives, the
 * column-wise read waits for a wider screen.
 *
 * Nothing is recomputed locally. `selectTransporterStats` owns the counting
 * rule (and the pre-rounded-sm on-time label), so this page and any future export
 * of the same figures cannot disagree about what a cycle is.
 */

/**
 * The seven numeric columns, header and accessor together.
 *
 * Declared as one list because the failure mode of a hand-written table is a
 * header that has drifted one cell away from the value under it.
 */
const TRANSPORTER_COLUMNS: readonly {
  id: string;
  label: string;
  value: (row: TransporterCycleStats) => string | number;
}[] = [
  { id: 'total', label: 'Total cycles', value: (row) => row.total },
  { id: 'completed', label: 'Completed', value: (row) => row.completed },
  { id: 'active', label: 'Active', value: (row) => row.active },
  // A carrier that has never held a sequence reads as a dash, not a zero — it
  // has no chain at all, which is a different fact from a chain of length zero.
  { id: 'longest-chain', label: 'Max chain', value: (row) => row.longestChain || '—' },
  { id: 'containers', label: 'Containers', value: (row) => row.containers },
  { id: 'on-time', label: 'On-time returns', value: (row) => row.onTimeLabel },
  { id: 'standalone', label: 'Standalone', value: (row) => row.standalone },
];

const COUNTING_RULE =
  'One cycle = one empty return + one linked full load mission (counted together, never separately). The transporter count = number of distinct completed Cycle IDs.';

/* ---------------------------------------------------------------------------
 * TransporterCard
 * ------------------------------------------------------------------------- */

interface TransporterCardProps {
  row: TransporterCycleStats;
}

/**
 * One carrier's seven figures, for the widths a table cannot survive.
 *
 * Eight columns on a phone meant a sideways scroll that took the carrier's name
 * off screen with it — every figure past `Completed` was a number with nothing
 * attached to it, which is the one thing this page must never be. The card
 * carries the name as a heading and labels each figure where it stands, so the
 * per-carrier read works at any width; the column-wise comparison the table
 * exists for simply is not offered below `md`, because it cannot be honoured.
 *
 * Both renderings walk `TRANSPORTER_COLUMNS`. That is the point of the spec
 * being data: the phone and the desktop cannot drift into disagreeing about
 * what "Max chain" means or which figure sits under which label.
 */
function TransporterCard({ row }: TransporterCardProps) {
  return (
    <div className="border-b border-border-subtle p-4 last:border-0">
      <CompanyName name={row.name} tone="strong" size="sm" textClassName="text-sm" />

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-4">
        {TRANSPORTER_COLUMNS.map((column) => (
          <div key={column.id} className="min-w-0">
            <dt className="text-[10px] uppercase leading-tight tracking-wide text-muted-foreground">
              {column.label}
            </dt>
            <dd className="mt-0.5 text-sm font-semibold text-foreground">
              <Mono>{column.value(row)}</Mono>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function EmptyReturnTransportersPage() {
  const now = useEmptyReturnStore((state) => state.now);
  const cyclesQuery = useCycles();
  const availableEmptiesQuery = useAvailableEmpties();

  const records = useMemo(
    () => [
      ...(cyclesQuery.data ?? []).map((cycle) => cycleToRow(cycle, now)),
      ...(availableEmptiesQuery.data ?? []).map((booking) => emptyBookingToRow(booking, now)),
    ],
    [cyclesQuery.data, availableEmptiesQuery.data, now],
  );
  const transporters = useMemo(() => selectTransporterStats(records), [records]);

  return (
    <div className="space-y-5 pb-12">
      <PageHeader
        title="Transporters"
        description="Empty returns & repeating cycles module — internal Operations view"
      />

      <Card padding="none" className="overflow-hidden">
        {transporters.length === 0 ? (
          <EmptyState
            className="py-12"
            icon={<Truck className="h-6 w-6" aria-hidden />}
            title="No transporter activity yet."
            description="Carriers appear here as soon as their first empty return is recorded."
          />
        ) : (
          <>
            {/* Below `md`: one card per carrier. See TransporterCard. */}
            <div className="md:hidden">
              {transporters.map((row) => (
                <TransporterCard key={row.name} row={row} />
              ))}
            </div>

            {/* From `md`: the real table, so the columns can be read straight
                down. The horizontal scroll lives on this wrapper, never on the
                page body — a tablet still has to reach the eighth column, and it
                must not drag the layout sideways to get there. */}
            <div className="hidden overflow-x-auto md:block">
              <TableRoot>
                <TableCaption>Cycle activity by transporter</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="bg-surface-sunken">Transporter</TableHead>
                    {TRANSPORTER_COLUMNS.map((column) => (
                      <TableHead key={column.id} className="bg-surface-sunken whitespace-nowrap">
                        {column.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-border-subtle">
                  {transporters.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell className="py-3 font-medium">
                        <CompanyName name={row.name} tone="strong" />
                      </TableCell>
                      {TRANSPORTER_COLUMNS.map((column) => (
                        <TableCell key={column.id} className="py-3">
                          <Mono>{column.value(row)}</Mono>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </TableRoot>
            </div>
          </>
        )}

        <p className="border-t border-border-subtle px-4 py-3 text-[11px] text-muted-foreground">
          {COUNTING_RULE}
        </p>
      </Card>
    </div>
  );
}

export default EmptyReturnTransportersPage;
