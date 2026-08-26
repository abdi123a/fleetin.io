import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES, buildPath } from '@/config/routes';
import { Card, Skeleton } from '@/design-system';
import { useBiDataset } from '@/features/shipper-bi/api/queries';
import { EMPTY_BI_DATASET } from '@/features/shipper-bi/api/biService';
import { useShipperAccount, type ShipperShipmentRow } from '@/features/shipper-bi';
import { deriveFacts } from '@/lib/bi/derive';
import { formatDate } from '@/utils';
import {
  AvoidableCard,
  ContainerCard,
  HeroTiles,
  LaneCard,
  OnTimeTrendCard,
  OutcomeMixCard,
  PeriodPicker,
  ShipmentBook,
  SpendTrendCard,
  TransporterCard,
  buildShipperInsight,
  type InsightRange,
} from './insight';

/**
 * The shipper's whole account, on one page.
 *
 * **What this page is for.** A shipper has three views of their work and they
 * are deliberately different lengths of time:
 *
 *   the **dashboard** — today: what is moving, what needs me this week;
 *   the **shipment** — one run: its mission report, every timestamp;
 *   **this page** — the account: months of work, trends, rankings, the book.
 *
 * Anything that belongs to one of the other two has been removed rather than
 * shown twice. That is most of what changed.
 *
 * **What it replaced.** Seven tabs and roughly thirty cards behind a six-control
 * filter bar. The duplication had become structural: delay responsibility was
 * drawn on this page, on the dashboard and in the monthly report; the detention
 * scatter appeared on two tabs of this very page; the Reports tab was a second
 * copy of a panel the shipment page owns; and the six pinned KPI tiles repeated
 * the dashboard's own opening row. Four of the filter bar's six controls
 * reached only those pinned tiles, so most of the page silently ignored them.
 *
 * **The shape now.** One control, one aggregation, and six blocks that each ask
 * a question in the words a shipper would use and answer it in their header:
 *
 *   1. the account in four numbers, against the window before it
 *   2. is my cargo arriving on time?
 *   3. where is my money going?
 *   4. are my containers going back in time?
 *   5. who moves my cargo / which lanes are working?
 *   6. every container, on record
 *
 * No tabs — a tab is a place for a number to hide from the number it
 * contradicts. Every figure comes from `buildShipperInsight`, so two blocks
 * cannot disagree.
 *
 * **Two colours**, the same rule as the shipper dashboard: teal is the account
 * working, orange is the account costing money or needing a person. See
 * `insight/kit.tsx`.
 *
 * The suite stays shipper-agnostic: the portal renders it for the signed-in
 * account and the admin's shipper detail page renders it for whichever record
 * is open. It draws no page chrome, because each host owns its own frame.
 */

export interface ShipperAnalyticsSuiteProps {
  /** Which shipper's book of work the page renders. */
  shipperId: string;
  /** Injected so the page is reproducible in tests and never reads the clock. */
  now?: Date;
}

export function ShipperAnalyticsSuite({ shipperId, now }: ShipperAnalyticsSuiteProps) {
  const navigate = useNavigate();

  // Pinned to the day: a `new Date()` per render would invalidate every query
  // key on every keystroke.
  const asOf = useMemo(() => now ?? new Date(), [now]);
  const [range, setRange] = useState<InsightRange>('6m');

  const { data: loadedDataset, isLoading } = useBiDataset(shipperId, asOf);
  const dataset = loadedDataset ?? EMPTY_BI_DATASET;
  const facts = useMemo(() => deriveFacts(dataset), [dataset]);

  const insight = useMemo(
    () => buildShipperInsight({ facts, dataset, range, asOf }),
    [facts, dataset, range, asOf],
  );

  // The book is the account's real rows — names, container numbers and the
  // link back to the shipment — which the fact table does not carry.
  const { rows } = useShipperAccount({ shipperId, now: asOf });

  const openShipment = (row: ShipperShipmentRow) => {
    navigate(
      buildPath(ROUTES.shipmentOverview, {
        id: row.shipmentId.replace(/^SHP-0*/i, '') || '1',
      }),
    );
  };

  if (isLoading) return <SuiteSkeleton />;

  return (
    <div className="flex flex-col gap-4">
      {/* The one control, and the window it resolves to — stated, because a
          figure whose period is not named is a figure two readers will read
          two different ways. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-body-sm text-muted-foreground">
          {formatDate(insight.period.from, 'date')} — {formatDate(insight.period.to, 'date')}
        </p>
        <PeriodPicker value={range} onChange={setRange} />
      </div>

      {/* The generated finding, then the four numbers it is drawn from. */}
      <p className="max-w-[74ch] text-[15px] leading-relaxed text-foreground">{insight.verdict}</p>

      <HeroTiles insight={insight} />

      {insight.isEmpty ? (
        <Card variant="default" padding="lg">
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nothing ran in this period. Try a longer window.
          </p>
        </Card>
      ) : (
        /*
         * A twelve-column grid, not a stack of full-width bands.
         *
         * The first build gave every subject the entire page width, which put a
         * ring at the far left of a 1,500px card and stretched a seven-point
         * line into a 10:1 ribbon with nothing in it — the reason the page read
         * as empty rather than as a dashboard. Paired 7/5 and 4/4/4 rows give
         * each graphic a shape it can fill, and `items-stretch` keeps the cards
         * in a row on one baseline so the grid reads as rows rather than as
         * ragged tiles.
         *
         * Nine cells including the tiles and the book, which is the range a
         * dashboard stays readable in — past that a reader scans instead of
         * reading.
         */
        <div className="grid grid-cols-12 items-stretch gap-4">
          <OnTimeTrendCard insight={insight} className="col-span-12 xl:col-span-7" />
          <OutcomeMixCard insight={insight} className="col-span-12 md:col-span-6 xl:col-span-5" />

          <SpendTrendCard insight={insight} className="col-span-12 xl:col-span-7" />
          <AvoidableCard insight={insight} className="col-span-12 md:col-span-6 xl:col-span-5" />

          <ContainerCard insight={insight} className="col-span-12 md:col-span-6 xl:col-span-4" />
          <TransporterCard insight={insight} className="col-span-12 md:col-span-6 xl:col-span-4" />
          <LaneCard insight={insight} className="col-span-12 md:col-span-6 xl:col-span-4" />
        </div>
      )}

      <ShipmentBook rows={rows} onOpen={openShipment} />
    </div>
  );
}

function SuiteSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((tile) => (
          <Card key={tile} variant="default" padding="lg" className="min-h-[136px] gap-3">
            <Skeleton shape="text" className="h-4 w-24" />
            <Skeleton shape="text" className="h-8 w-20" />
          </Card>
        ))}
      </div>
      {[1, 2, 3].map((block) => (
        <Card key={block} variant="default" padding="lg" className="gap-4">
          <Skeleton shape="text" className="h-5 w-56" />
          <Skeleton shape="block" className="h-40 w-full" />
        </Card>
      ))}
    </div>
  );
}
