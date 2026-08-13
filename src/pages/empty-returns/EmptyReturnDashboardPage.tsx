import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
import { HOUR_MS } from '@/data/emptyReturnData';
import {
  riskOf,
  slackOf,
  startEmptyReturnClock,
  useEmptyReturnStore,
} from '@/stores/emptyReturn.store';
import type { EmptyReturnFilters } from '@/types/emptyReturn';

import { DualTransactionsRecommendationsModal } from './components/DualTransactionsRecommendationsModal';
import {
  CarrierScoreboardCard,
  ChainsCard,
  CyclePipelineCard,
  DeadlineRiskBoardCard,
  EmptyReturnConsoleHeader,
  MatchingOpportunitiesCard,
  ReturnKpiTiles,
  ReturnsOutstandingCard,
  buildEmptyReturnConsoleModel,
} from './components/console';

/**
 * The Empty Returns console — the module's landing screen. It borrows the
 * shipper/transporter consoles' colours and panel language (tile fills,
 * `ConsolePanel`, meters, donuts) but not their structure: no personal
 * greeting, no alert pills, no timeframe picker. This module runs on a clock
 * racing a deadline, not a reporting period, so the header just names the
 * page and gets out of the way, and the three rows below are its own.
 *
 * The reading order is the argument. Row one is the only thing that can cost
 * money tonight: which boxes breach first, and how many are already back.
 * Row two is the work: the lifecycle pipeline beside the same-yard pairings
 * that would shorten it. Row three is the network running the work: carriers
 * and chains. A dispatcher who stops after row one has still seen everything
 * urgent — the KPI tiles alone already carry Overdue and Critical in solid
 * colour, so nothing above them needs to repeat those counts.
 *
 * Every figure is a door — tiles, board rows and legend chips all land on the
 * sibling view with the matching filter already applied — and all arithmetic
 * happens once, in `buildEmptyReturnConsoleModel`, so a tile and the list it
 * opens cannot disagree.
 */
export function EmptyReturnDashboardPage() {
  const navigate = useNavigate();

  const records = useEmptyReturnStore((state) => state.records);
  const missions = useEmptyReturnStore((state) => state.missions);
  const now = useEmptyReturnStore((state) => state.now);
  const applyFilterPreset = useEmptyReturnStore((state) => state.applyFilterPreset);
  const focusRecord = useEmptyReturnStore((state) => state.focusRecord);
  // Moved here from the Matching page's own header — Matching is a workbench
  // you land on with a container already in mind, not where you'd start
  // "make me a match" from cold.
  const [dualOpen, setDualOpen] = useState(false);

  // Risk and slack are read against the wall clock, so the page keeps one
  // running even when mounted outside the module chrome.
  useEffect(() => startEmptyReturnClock(), []);

  const model = useMemo(
    () => buildEmptyReturnConsoleModel({ records, missions, now }),
    [records, missions, now],
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

      {/* What can cost money tonight — the board, and the count behind it */}
      <ConsoleRow
        main={
          <DeadlineRiskBoardCard
            rows={model.urgent}
            onOpenCycles={() => goCycles()}
            onSelectRow={(record) => {
              focusRecord(record.id, record.container);
              navigate(ROUTES.emptyReturnsCycles);
            }}
          />
        }
        side={<ReturnsOutstandingCard data={model.outstanding} />}
      />

      {/* The work: the pipeline, and the pairings that would shorten it */}
      <ConsoleRow
        main={
          <CyclePipelineCard
            pipeline={model.pipeline}
            matchable={model.matching.matchable}
            onOpenCycles={() => goCycles()}
            onStageSelect={(status) => goCycles({ q: '', status, risk: 'all' })}
          />
        }
        side={
          <MatchingOpportunitiesCard
            data={model.matching}
            onOpenMatching={() => navigate(ROUTES.emptyReturnsMatching)}
          />
        }
      />

      {/* The network running the work: carriers, and the loops they keep alive */}
      <ConsoleRow
        main={
          <CarrierScoreboardCard
            carriers={model.carriers}
            onOpenLeague={() => navigate(ROUTES.emptyReturnsTransporters)}
          />
        }
        side={
          <ChainsCard
            chains={model.chains}
            onOpenChains={() => navigate(`${ROUTES.emptyReturnsCycles}?tab=chains`)}
            onOpenMatching={() => navigate(ROUTES.emptyReturnsMatching)}
          />
        }
      />
    </div>
  );
}

/** The console's one row shape: analysis at 2/3, the figure it turns on at 1/3. */
function ConsoleRow({ main, side }: { main: ReactNode; side: ReactNode }) {
  return (
    <section className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-12">
      <div className="flex min-w-0 flex-col xl:col-span-8">{main}</div>
      <div className="flex min-w-0 flex-col xl:col-span-4">{side}</div>
    </section>
  );
}

export default EmptyReturnDashboardPage;
