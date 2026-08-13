import { useState, useMemo } from 'react';
import { ChevronRight } from '@/design-system/icons';
import { Card, CompanyAvatar } from '@/design-system';
import type { DatePreset } from '@/features/shipper-bi/contracts';
import { getTransporterLogoUrl } from '@/features/shipper-bi/mocks/transporterProfiles';
import { cn } from '@/utils';
import { PanelLink, PANEL_SURFACE } from './PanelHeader';

export interface TransporterPerformanceConsoleCardProps {
  preset?: DatePreset;
  from?: string;
  to?: string;
  className?: string;
  onViewAll?: () => void;
}

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------ */

type GoodsType = 'containers' | 'bulk_commodities' | 'bulk_steel' | 'livestock';

interface TransporterRow {
  id: string;
  name: string;
  fleetCode: string;
  avgDeliveryHours: number;
  avgCostPerLoad: number;
  meetsSla: boolean;
}

interface GoodsTab {
  key: GoodsType;
  label: string;
  shortLabel: string;
  count: number;
  color: string;
}

/* ---------------------------------------------------------------------------
 * Data — ranked transporters per cargo type (logos from shared registry)
 * ------------------------------------------------------------------------ */

/**
 * One bar colour per carrier so the ranking chart is scannable at a glance.
 * Assigned by position from the chart's categorical scale, same as any other
 * series — a carrier keeps its colour even if the ranking above it changes.
 */
const CARRIER_BAR_COLORS: Record<string, string> = {
  'TRP-01': 'bg-chart-1',
  'TRP-02': 'bg-chart-2',
  'TRP-03': 'bg-chart-3',
  'TRP-04': 'bg-chart-4',
  'TRP-05': 'bg-chart-5',
  'TRP-06': 'bg-chart-6',
  'TRP-07': 'bg-chart-7',
};

const FALLBACK_BAR_COLOR = 'bg-primary';

const GOODS_DATA: Record<GoodsType, TransporterRow[]> = {
  containers: [
    { id: 'TRP-01', name: 'Horn Logistics',        fleetCode: 'HRN', avgDeliveryHours: 18.4, avgCostPerLoad: 219_800, meetsSla: true  },
    { id: 'TRP-02', name: 'Bab El Mandeb Transit',  fleetCode: 'BEM', avgDeliveryHours: 20.3, avgCostPerLoad: 209_100, meetsSla: true  },
    { id: 'TRP-06', name: 'Djibouti Express',       fleetCode: 'DJX', avgDeliveryHours: 31.5, avgCostPerLoad: 398_700, meetsSla: true  },
    { id: 'TRP-04', name: 'Tadjoura Haulage',       fleetCode: 'TDJ', avgDeliveryHours: 34.2, avgCostPerLoad: 249_800, meetsSla: false },
    { id: 'TRP-07', name: 'Gulf Freight Partners',  fleetCode: 'GFP', avgDeliveryHours: 55.2, avgCostPerLoad: 475_600, meetsSla: false },
  ],
  bulk_commodities: [
    { id: 'TRP-03', name: 'Awash Freight Lines',    fleetCode: 'AWF', avgDeliveryHours: 16.8, avgCostPerLoad: 178_400, meetsSla: true  },
    { id: 'TRP-05', name: 'Red Sea Movers',         fleetCode: 'RSM', avgDeliveryHours: 21.4, avgCostPerLoad: 162_900, meetsSla: true  },
    { id: 'TRP-01', name: 'Horn Logistics',         fleetCode: 'HRN', avgDeliveryHours: 26.9, avgCostPerLoad: 191_300, meetsSla: true  },
    { id: 'TRP-07', name: 'Gulf Freight Partners',  fleetCode: 'GFP', avgDeliveryHours: 38.5, avgCostPerLoad: 204_700, meetsSla: false },
    { id: 'TRP-04', name: 'Tadjoura Haulage',       fleetCode: 'TDJ', avgDeliveryHours: 47.2, avgCostPerLoad: 215_800, meetsSla: false },
  ],
  bulk_steel: [
    { id: 'TRP-06', name: 'Djibouti Express',       fleetCode: 'DJX', avgDeliveryHours: 23.1, avgCostPerLoad: 298_600, meetsSla: true  },
    { id: 'TRP-02', name: 'Bab El Mandeb Transit',  fleetCode: 'BEM', avgDeliveryHours: 28.4, avgCostPerLoad: 312_400, meetsSla: true  },
    { id: 'TRP-03', name: 'Awash Freight Lines',    fleetCode: 'AWF', avgDeliveryHours: 35.7, avgCostPerLoad: 334_100, meetsSla: false },
    { id: 'TRP-05', name: 'Red Sea Movers',         fleetCode: 'RSM', avgDeliveryHours: 44.3, avgCostPerLoad: 351_200, meetsSla: false },
  ],
  livestock: [
    { id: 'TRP-04', name: 'Tadjoura Haulage',       fleetCode: 'TDJ', avgDeliveryHours: 14.2, avgCostPerLoad: 134_500, meetsSla: true  },
    { id: 'TRP-07', name: 'Gulf Freight Partners',  fleetCode: 'GFP', avgDeliveryHours: 17.8, avgCostPerLoad: 128_900, meetsSla: true  },
    { id: 'TRP-05', name: 'Red Sea Movers',         fleetCode: 'RSM', avgDeliveryHours: 22.6, avgCostPerLoad: 143_200, meetsSla: true  },
    { id: 'TRP-01', name: 'Horn Logistics',         fleetCode: 'HRN', avgDeliveryHours: 30.1, avgCostPerLoad: 156_700, meetsSla: false },
  ],
};

const TABS: [GoodsTab, ...GoodsTab[]] = [
  { key: 'containers',       label: 'Containers',       shortLabel: 'Containers',  count: 46, color: 'bg-info-subtle text-info-subtle-foreground dark:bg-info-subtle dark:text-info-subtle-foreground'        },
  { key: 'bulk_commodities', label: 'Bulk – Commodities', shortLabel: 'Commodities', count: 34, color: 'bg-warning-subtle text-warning-subtle-foreground dark:bg-warning-subtle dark:text-warning-subtle-foreground'   },
  { key: 'bulk_steel',       label: 'Bulk – Steel',     shortLabel: 'Steel',       count: 12, color: 'bg-muted text-muted-foreground dark:bg-muted/60 dark:text-muted-foreground'    },
  { key: 'livestock',        label: 'Livestock',        shortLabel: 'Livestock',   count: 9,  color: 'bg-success-subtle text-success-subtle-foreground dark:bg-success-subtle dark:text-success-subtle-foreground' },
];

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------ */

function fmtHours(h: number): string {
  if (h < 24) return `${h.toFixed(1)}h`;
  const days = Math.floor(h / 24);
  const rem  = Math.round(h % 24);
  return rem === 0 ? `${days}d` : `${days}d ${rem}h`;
}

/* ---------------------------------------------------------------------------
 * Component
 * ------------------------------------------------------------------------ */

export function TransporterPerformanceConsoleCard({
  from: _from,
  to: _to,
  className = '',
  onViewAll,
}: TransporterPerformanceConsoleCardProps) {
  const [activeTab, setActiveTab] = useState<GoodsType>('containers');

  const rows = useMemo(() => GOODS_DATA[activeTab], [activeTab]);
  const activeTabMeta = TABS.find((t) => t.key === activeTab) ?? TABS[0];

  // Invert bar so fastest carrier gets the longest bar, then normalize to 0–100
  const slowest   = rows[rows.length - 1]?.avgDeliveryHours ?? 1;
  const rawValues = rows.map((r) => slowest - r.avgDeliveryHours + 6);
  const rawMax    = Math.max(...rawValues);
  const barValues = rawValues.map((v) => parseFloat(((v / rawMax) * 100).toFixed(1)));

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
              Best carriers per cargo type — ranked by fastest delivery
            </p>
          </div>
          {/* Column header labels */}
          <div className="flex shrink-0 items-center gap-5 pt-2 text-xs font-bold text-muted-foreground">
            <span>Price</span>
            <span>Avg Time</span>
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
                  activeTab === tab.key ? tab.color : 'bg-muted text-muted-foreground',
                )}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Main Performance Chart Section ─────────────────────────────── */}
      <div className="relative z-10 flex flex-1 flex-col justify-center px-6 py-4">
        {/* Vertical Grid Background Lines */}
        <div className="pointer-events-none absolute inset-y-4 left-[4.5rem] right-[10.5rem]">
          <div className="flex h-[calc(100%-1.75rem)] w-full justify-between">
            <div className="h-full border-r border-dashed border-border/40" />
            <div className="h-full border-r border-dashed border-border/40" />
            <div className="h-full border-r border-dashed border-border/40" />
            <div className="h-full border-r border-dashed border-border/40" />
            <div className="h-full border-r border-dashed border-border/40" />
          </div>
        </div>

        {/* Carrier Performance Rows */}
        <div className="relative flex flex-col gap-3">
          {rows.map((r, i) => {
            const logoUrl = getTransporterLogoUrl(r.id);
            const barWidthPercent = barValues[i];

            return (
              <div
                key={r.id}
                className="group relative flex min-h-10 items-center gap-3 rounded-md py-0.5 transition-colors hover:bg-muted/30"
                title={`${r.name} (${r.fleetCode}) — ${r.meetsSla ? 'Passing SLA' : 'Below Target'}`}
              >
                {/* Transporter logo — one per carrier, shared across the dashboard */}
                <CompanyAvatar
                  src={logoUrl}
                  name={r.name}
                  fallback={r.fleetCode.slice(0, 2).toUpperCase()}
                  size="sm"
                  shape="circle"
                  className="shrink-0 transition-transform duration-200 group-hover:scale-110"
                />

                {/* Name + performance bar */}
                <div className="relative min-w-0 flex-1">
                  <span className="mb-0.5 block truncate text-[10px] font-semibold leading-none text-foreground">
                    {r.name}
                  </span>
                  <div className="h-4 w-full overflow-hidden rounded-md bg-muted/40">
                    <div
                      className={cn(
                        'h-full rounded-md transition-all duration-500 ease-out',
                        CARRIER_BAR_COLORS[r.id] ?? FALLBACK_BAR_COLOR,
                        !r.meetsSla && 'opacity-70',
                      )}
                      style={{ width: `${barWidthPercent}%` }}
                    />
                  </div>
                </div>

                {/* Price & Avg Time Metrics */}
                <div className="flex shrink-0 items-center gap-4 text-right">
                  <span
                    className={cn(
                      'w-24 text-xs font-semibold tabular-nums',
                      i === 0 ? 'text-success-subtle-foreground' : 'text-foreground',
                    )}
                  >
                    DJF {r.avgCostPerLoad.toLocaleString()}
                  </span>
                  <span
                    className={cn(
                      'w-12 text-sm font-bold tabular-nums',
                      r.meetsSla ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    {fmtHours(r.avgDeliveryHours)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* X-Axis Numbers Scale */}
        <div className="relative flex items-center justify-between pl-[4.5rem] pr-[10.5rem] pt-3 text-[11px] font-semibold text-muted-foreground">
          <span>0</span>
          <span>25</span>
          <span>50</span>
          <span>75</span>
          <span>100</span>
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-t border-border/60 px-6 py-3">
        <p className="text-xs text-muted-foreground">
          {rows.length} carriers rated for{' '}
          <span className="font-semibold text-foreground">{activeTabMeta.label}</span>
        </p>
        {onViewAll && (
          <PanelLink onClick={onViewAll}>
            <span className="inline-flex items-center gap-1">
              View All Carriers
              <ChevronRight className="size-3" />
            </span>
          </PanelLink>
        )}
      </div>
    </Card>
  );
}

export default TransporterPerformanceConsoleCard;


