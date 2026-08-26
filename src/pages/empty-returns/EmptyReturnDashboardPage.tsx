import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
import { HOUR_MS } from '@/data/emptyReturnData';
import {
  riskOf,
  slackOf,
  startEmptyReturnClock,
  useEmptyReturnStore,
} from '@/stores/emptyReturn.store';
import { useAvailableEmpties, useCycles, useOpenFullLoads } from '@/features/empty-returns/api/queries';
import { bookingToFullLoadMission, cycleToRow, emptyBookingToRow } from '@/features/empty-returns/mappers';
import type { EmptyReturnFilters } from '@/types/emptyReturn';

import { DualTransactionsRecommendationsModal } from './components/DualTransactionsRecommendationsModal';
import {
  EmptyReturnConsoleHeader,
  ReturnKpiTiles,
  ReturnPlanningCalendarCard,
  buildEmptyReturnConsoleModel,
} from './components/console';

/**
 * The Empty Returns console — the module's landing screen. It borrows the
 * shipper/transporter consoles' colours and panel language (tile fills,
 * `ConsolePanel`, meters, donuts) but not their structure: no personal
 * greeting, no alert pills, no timeframe picker. This module runs on a clock
 * racing a deadline, not a reporting period, so the header just names the
 * page and gets out of the way, and the row below is its own.
 *
 * The reading order is the argument. The KPI tiles carry everything urgent —
 * Overdue and Critical in solid colour — so nothing below them needs to repeat
 * those counts. Under the tiles sit the two figures a dispatcher acts on: how
 * many boxes are still out and how loudly their clocks tick, beside the
 * same-yard pairings that would take boxes off that count today.
 *
 * Every figure is a door — tiles, board rows and legend chips all land on the
 * sibling view with the matching filter already applied — and all arithmetic
 * happens once, in `buildEmptyReturnConsoleModel`, so a tile and the list it
 * opens cannot disagree.
 */
export function EmptyReturnDashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

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
  /* The inbound fulls still looking for a truck. An unmatched empty at one of
   * these yards has something it could be paired with — which is what separates
   * "Planned Full" from "Awaiting Full" on the calendar. */
  const openFullLoadsQuery = useOpenFullLoads();
  const openFullLoads = useMemo(
    () => (openFullLoadsQuery.data ?? []).map(bookingToFullLoadMission),
    [openFullLoadsQuery.data],
  );
  const applyFilterPreset = useEmptyReturnStore((state) => state.applyFilterPreset);
  const focusRecord = useEmptyReturnStore((state) => state.focusRecord);
  // Moved here from the Matching page's own header — Matching is a workbench
  // you land on with a container already in mind, not where you'd start
  // "make me a match" from cold.
  const [dualOpen, setDualOpen] = useState(false);

  // Risk and slack are read against the wall clock, so the page keeps one
  // running even when mounted outside the module chrome.
  useEffect(() => startEmptyReturnClock(), []);

  // Deep link from a booking's own Empty Return card ("find this container
  // a match") — `?createMatch=1` opens the same modal the header's button
  // does, then clears itself so a refresh doesn't reopen it.
  useEffect(() => {
    if (searchParams.get('createMatch') !== '1') return;
    setDualOpen(true);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('createMatch');
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  const model = useMemo(
    () => buildEmptyReturnConsoleModel({ records, now }),
    [records, now],
  );

  const goCycles = (preset?: EmptyReturnFilters) => {
    if (preset) applyFilterPreset(preset);
    navigate(ROUTES.emptyReturnsCycles);
  };

  /**
   * The console in a spreadsheet: every record, worst slack first, with the
   * same derived risk the screen shows — so a pasted row reconciles against
   * the board it came from.
   */
  const handleExportCsv = () => {
    const header =
      'Record,Container,Type,Line,Status,Risk,SlackHours,Deadline,Shipper,Carrier,LocationId,Location,Cycle,Chain\n';
    const body = [...records]
      .sort((a, b) => (slackOf(a, now) ?? Infinity) - (slackOf(b, now) ?? Infinity))
      .map((record) => {
        const slack = slackOf(record, now);
        return [
          record.id,
          record.container,
          record.type,
          record.line,
          record.status,
          riskOf(record, now) ?? '',
          slack === null ? '' : (slack / HOUR_MS).toFixed(1),
          record.deadline ? new Date(record.deadline).toISOString() : '',
          `"${record.client}"`,
          `"${record.transporter}"`,
          record.locationId,
          `"${record.locationName}"`,
          record.cycleId ?? '',
          record.chainId ?? '',
        ].join(',');
      })
      .join('\n');

    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `empty-returns-console-${new Date(now).toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 pb-6 pt-1 sm:px-6">
      <EmptyReturnConsoleHeader onExportCsv={handleExportCsv} onCreateMatch={() => setDualOpen(true)} />

      <DualTransactionsRecommendationsModal
        open={dualOpen}
        onOpenChange={setDualOpen}
        onAccepted={(recordIds) => {
          const last = recordIds[recordIds.length - 1];
          if (last) navigate(ROUTES.emptyReturnsCycles);
        }}
      />

      {/* The five doors, full width — the first thing on the page, on their own line on big screens */}
      <ReturnKpiTiles
        kpis={model.kpis}
        assignedSplit={model.assignedSplit}
        stillOut={model.outstanding.stillOut}
        onSelect={(preset) => goCycles(preset)}
      />

      {/* The month, full width and full height — the centre of this console.
          The tiles above say how bad it is; this says *when*, which is the
          question a dispatcher acts on. It opens on the month rather than the
          week because an empty-return deadline is usually a week or two out,
          and a seven-day window hides the ones worth planning for. */}
      <ReturnPlanningCalendarCard
        records={records}
        now={now}
        openFullLoads={openFullLoads}
        onSelectRecord={(record) => {
          focusRecord(record.id, record.container);
          navigate(ROUTES.emptyReturnsCycles);
        }}
      />
    </div>
  );
}

export default EmptyReturnDashboardPage;
