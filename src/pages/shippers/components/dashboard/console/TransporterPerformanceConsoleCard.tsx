import { useState, useMemo } from 'react';
import type { ApexOptions } from 'apexcharts';
import { ChevronRight } from '@/design-system/icons';
import { Card, CompanyAvatar } from '@/design-system';
import type { DatePreset } from '@/features/shipper-bi/contracts';
import type { ShipperShipmentRow } from '@/features/shipper-bi';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import {
  baseChartOptions,
  chartAnimSpeed,
  quietStates,
  resolveColor,
} from '@/features/shipper-bi/charts/apexChartTheme';
import { getTransporterLogoUrl } from '@/features/shipper-bi/mocks/transporterProfiles';
import { cn } from '@/utils';
import { PanelLink, PANEL_SURFACE } from './PanelHeader';

export interface TransporterPerformanceConsoleCardProps {
  preset?: DatePreset;
  from?: string;
  to?: string;
  className?: string;
  onViewAll?: () => void;
  /** The shipper's own book — who actually carried what, and at what price. */
  rows: ShipperShipmentRow[];
}

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------ */

interface TransporterRow {
  id: string;
  name: string;
  fleetCode: string;
  avgDeliveryHours: number;
  avgCostPerLoad: number;
  /** Share of this carrier's shipments delivered on-time or early, 0–100. */
  onTimeRate: number;
  meetsSla: boolean;
}

interface GoodsTab {
  key: string;
  label: string;
  count: number;
}

/**
 * Ranks the carriers this shipper actually used, per cargo type it actually
 * shipped — from the same rows the shipments table lists.
 *
 * This card used to be a hardcoded league table: seven carriers that are not in
 * the database ("Horn Logistics", "Djibouti Express") at 130k–475k a load,
 * against a book whose real transporters bill 40–48k. A shipper comparing
 * carriers is making a procurement decision, so a table of invented names and
 * invented prices is the single most misleading thing this dashboard could show.
 *
 * Delivery time is measured pickup → arrival on each row, and price is the
 * charge on the row itself, so both agree with the shipment list and the
 * monthly report by construction.
 */
function rankCarriers(rows: ShipperShipmentRow[]) {
  const byCargo = new Map<string, Map<string, { hours: number[]; costs: number[]; onTime: number; total: number }>>();

  for (const row of rows) {
    if (!row.transporter) continue;
    const carriers = byCargo.get(row.cargoType) ?? new Map();
    const stat = carriers.get(row.transporter) ?? { hours: [], costs: [], onTime: 0, total: 0 };

    /* Punctuality against the promised date, which is the comparison a
     * shipper choosing between carriers actually makes — and the only one
     * these rows support honestly. Absolute transit would need the pickup
     * time, which the row does not carry; deriving it from the promise and
     * the variance double-counts the same delta. */
    if (row.varianceMinutes !== undefined) {
      stat.hours.push(row.varianceMinutes / 60);
    }
    if (row.cost > 0) stat.costs.push(row.cost);
    stat.total += 1;
    if (row.outcome === 'on_time' || row.outcome === 'early') stat.onTime += 1;

    carriers.set(row.transporter, stat);
    byCargo.set(row.cargoType, carriers);
  }

  const mean = (values: number[]) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

  const tabs: GoodsTab[] = [];
  const data: Record<string, TransporterRow[]> = {};

  for (const [cargoType, carriers] of byCargo) {
    const ranked = [...carriers.entries()]
      .map(([name, stat]) => ({
        id: name,
        name,
        fleetCode: name.slice(0, 3).toUpperCase(),
        avgDeliveryHours: mean(stat.hours),
        avgCostPerLoad: Math.round(mean(stat.costs)),
        onTimeRate: stat.total > 0 ? Math.round((stat.onTime / stat.total) * 100) : 0,
        // The house target the rest of the suite ranks against.
        meetsSla: stat.total > 0 && stat.onTime / stat.total >= 0.9,
      }))
      .filter((carrier) => carrier.avgCostPerLoad > 0)
      .sort((a, b) => a.avgDeliveryHours - b.avgDeliveryHours)
      .slice(0, 5);
    if (ranked.length === 0) continue;

    const count = [...carriers.values()].reduce((sum, stat) => sum + stat.total, 0);
    tabs.push({ key: cargoType, label: cargoType, count });
    data[cargoType] = ranked;
  }

  tabs.sort((a, b) => b.count - a.count);
  return { tabs, data };
}

/* ---------------------------------------------------------------------------
 * Data — ranked transporters per cargo type (logos from shared registry)
 * ------------------------------------------------------------------------ */

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------ */

/** Signed hours against the promised date: "on time", "2.4h early", "1d 3h late". */
function fmtHours(h: number): string {
  const magnitude = Math.abs(h);
  if (magnitude < 0.5) return 'on time';
  const suffix = h > 0 ? 'late' : 'early';
  if (magnitude < 24) return `${magnitude.toFixed(1)}h ${suffix}`;
  const days = Math.floor(magnitude / 24);
  const rem = Math.round(magnitude % 24);
  return rem === 0 ? `${days}d ${suffix}` : `${days}d ${rem}h ${suffix}`;
}

/* ---------------------------------------------------------------------------
 * Component
 * ------------------------------------------------------------------------ */

export function TransporterPerformanceConsoleCard({
  from: _from,
  to: _to,
  className = '',
  onViewAll,
  rows: accountRows,
}: TransporterPerformanceConsoleCardProps) {
  const { tabs: TABS, data: GOODS_DATA } = useMemo(() => rankCarriers(accountRows), [accountRows]);
  const [selectedTab, setSelectedTab] = useState<string | null>(null);

  /* The tab list is derived from what this shipper ships, so the selection has
   * to fall back rather than pin to a cargo type that may not be in the book. */
  const activeTab = selectedTab && GOODS_DATA[selectedTab] ? selectedTab : (TABS[0]?.key ?? '');
  const setActiveTab = setSelectedTab;

  const rows = useMemo(() => GOODS_DATA[activeTab] ?? [], [GOODS_DATA, activeTab]);
  const activeTabMeta = TABS.find((t) => t.key === activeTab) ?? TABS[0];

  const ring = useMemo(() => resolveColor('var(--primary)', '#60969d'), []);

  /* One small gauge per carrier — never one chart with five concentric rings.
   * A nested multi-series radialBar has no way to say which ring is which
   * carrier without a legend the reader has to decode; a separate gauge sits
   * right on top of its own avatar and prints its own number, so there is
   * nothing to match up. Every gauge shares one options object — only the
   * value passed to `series` changes per carrier. */
  const gaugeOptions: ApexOptions = useMemo(
    () =>
      baseChartOptions({
        chart: {
          type: 'radialBar',
          animations: { enabled: chartAnimSpeed() > 0, speed: chartAnimSpeed() },
        },
        colors: [ring],
        stroke: { lineCap: 'round' },
        grid: { padding: { left: 0, right: 0, top: -6, bottom: -6 } },
        plotOptions: {
          radialBar: {
            hollow: { size: '58%' },
            track: { background: 'var(--surface-sunken)', strokeWidth: '100%' },
            dataLabels: {
              name: { show: false },
              value: {
                offsetY: 7,
                fontSize: '19px',
                fontWeight: 800,
                fontFamily: 'inherit',
                color: 'var(--foreground)',
                formatter: (val: number) => `${Math.round(val)}%`,
              },
            },
          },
        },
        legend: { show: false },
        states: quietStates,
        tooltip: { enabled: false },
      }),
    [ring],
  );

  return (
    <Card
      variant="default"
      padding="none"
      className={cn('flex h-full flex-col overflow-visible', PANEL_SURFACE, className)}
    >
      {/* ── Header + tabs ─────────────────────────────────────────────── */}
      <div className="relative z-0 border-b border-border/60 px-6 pt-5 pb-0">
        <div className="flex items-start justify-between gap-4 pb-3">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-foreground md:text-2xl">
              Transporter Performance
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Most punctual transporters per cargo type
            </p>
          </div>
        </div>

        {/* Goods-type tabs */}
        <div className="flex gap-0 overflow-x-auto -mb-px scrollbar-none">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-bold whitespace-nowrap transition-colors focus-visible:outline-none',
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                  activeTab === tab.key
                    ? 'bg-primary-subtle text-primary-subtle-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Main Performance Chart Section ─────────────────────────────── */}
      {/* A gauge per carrier, each sitting right on its own avatar — never
          apart in a chart-plus-legend pair the reader has to match up. Wraps
          freely so a narrow screen stacks two or three per row instead of
          squeezing all five into one. */}
      <div className="flex flex-1 flex-wrap items-start justify-around gap-x-4 gap-y-6 px-4 py-8 sm:px-6">
        {rows.map((r) => {
          const logoUrl = getTransporterLogoUrl(r.id);
          return (
            <div
              key={r.id}
              className="flex w-28 flex-col items-center gap-2 text-center"
              title={`${r.name} — ${r.onTimeRate}% on-time (${r.meetsSla ? 'meets' : 'below'} the 90% target) · ${fmtHours(r.avgDeliveryHours)} avg vs promise`}
            >
              <div className="size-28 sm:size-32">
                <ApexChart type="radialBar" series={[r.onTimeRate]} options={gaugeOptions} />
              </div>
              <CompanyAvatar
                src={logoUrl}
                name={r.name}
                fallback={r.fleetCode.slice(0, 2).toUpperCase()}
                size="sm"
                shape="circle"
              />
              <span className="line-clamp-2 text-[10.5px] font-semibold leading-tight text-foreground">
                {r.name}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-t border-border/60 px-6 py-3">
        <p className="text-xs text-muted-foreground">
          {rows.length} transporters rated for{' '}
          <span className="font-semibold text-foreground">{activeTabMeta?.label ?? '—'}</span>
        </p>
        {onViewAll && (
          <PanelLink onClick={onViewAll}>
            <span className="inline-flex items-center gap-1">
              All transporters
              <ChevronRight className="size-3" />
            </span>
          </PanelLink>
        )}
      </div>
    </Card>
  );
}

export default TransporterPerformanceConsoleCard;


