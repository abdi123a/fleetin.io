import {
  AlertTriangle,
  ArrowUpRight,
  ClipboardCheck,
  FileWarning,
  Minus,
  Package,
  Percent,
  Receipt,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import type { ApexOptions } from 'apexcharts';
import { IconChip, type IconChipTint } from '../Display/IconChip/IconChip';
import { trendMonths, type kpis } from '@/data/dashboardData';
import { useCountUp } from '@/hooks/useCountUp';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import { sparklineOptions } from '@/features/shipper-bi/charts/apexChartTheme';

export type StatCardProps = (typeof kpis)[number] & { ready?: boolean };

const icons: Record<string, LucideIcon> = {
  bookings: Package,
  revenue: Wallet,
  commission: Percent,
  cheques: Receipt,
  documents: FileWarning,
  approvals: ClipboardCheck,
};

/* `chip` names an IconChip tint — the one solid-disc mark used system-wide. */
const tone = {
  up: {
    stroke: 'var(--primary, #60969d)',
    fill: 'var(--primary, #60969d)',
    pill: 'bg-primary-subtle text-primary-subtle-foreground',
    chip: 'teal',
    rule: 'bg-primary',
  },
  neutral: {
    stroke: 'var(--muted-foreground, #717b87)',
    fill: 'var(--muted-foreground, #717b87)',
    pill: 'bg-muted text-muted-foreground',
    chip: 'neutral',
    rule: 'bg-muted-foreground',
  },
  warning: {
    stroke: 'var(--warning, #ffb502)',
    fill: 'var(--warning, #ffb502)',
    pill: 'bg-warning-subtle text-warning-subtle-foreground',
    chip: 'amber',
    rule: 'bg-warning',
  },
} satisfies Record<string, { stroke: string; fill: string; pill: string; chip: IconChipTint; rule: string }>;

const DeltaIcon = { up: ArrowUpRight, neutral: Minus, warning: AlertTriangle };

export function StatCard({
  label,
  icon,
  value,
  format,
  delta,
  deltaDirection,
  sub,
  trend,
  ready = true,
}: StatCardProps) {
  const t = tone[deltaDirection];
  const Icon = icons[icon] || Package;
  const Delta = DeltaIcon[deltaDirection];
  const animated = useCountUp(value, ready);

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const min = Math.min(...trend);
  const max = Math.max(...trend);
  const pad = (max - min) * 0.28 || 1;

  const shown = (hoverIdx != null ? trend[hoverIdx] : animated) ?? 0;
  const display =
    shown.toLocaleString('en-US', {
      minimumFractionDigits: format.decimals,
      maximumFractionDigits: format.decimals,
    }) + format.suffix;

  const sparkOptions: ApexOptions = sparklineOptions(t.stroke, {
    chart: {
      animations: { enabled: ready, speed: 1100 },
      events: {
        mouseMove: (_e, _ctx, config) => {
          const idx = config?.dataPointIndex;
          if (idx != null && idx >= 0) setHoverIdx(idx);
        },
        mouseLeave: () => setHoverIdx(null),
      },
    },
    yaxis: {
      min: min - pad,
      max: max + pad,
      show: false,
    },
    markers: {
      size: 0,
      hover: { size: 3.5 },
      strokeWidth: 1.5,
      strokeColors: 'var(--card, #fff)',
    },
    tooltip: { enabled: false },
    grid: { show: false },
  });

  return (
    <div className="group relative h-[176px] overflow-hidden rounded-lg border border-border bg-card shadow-xs transition duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-card">
      <span
        className={`absolute inset-x-0 top-0 z-20 h-0.5 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100 ${t.rule}`}
      />

      <div className="relative z-10 p-4">
        <div className="flex h-8 items-start justify-between gap-2">
          <span className="type-body-sm font-medium text-muted-foreground">{label}</span>
          <IconChip
            icon={Icon}
            tint={t.chip}
            size={36}
            className="transition-transform duration-200 group-hover:scale-110"
          />
        </div>

        <div className="mt-2 type-h1 tabular-nums text-foreground">{display}</div>

        <div className="mt-2.5 flex h-[19px] items-center gap-1.5">
          {hoverIdx != null ? (
            <>
              <span
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 type-caption text-white"
                style={{ backgroundColor: t.stroke }}
              >
                {trendMonths[hoverIdx]}
              </span>
              <span className="truncate type-caption text-muted-foreground">12-mo trend</span>
            </>
          ) : (
            <>
              <span
                className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 type-caption ${t.pill}`}
              >
                <Delta className="h-3 w-3" strokeWidth={2.75} />
                {delta}
              </span>
              <span className="truncate type-caption text-muted-foreground">{sub}</span>
            </>
          )}
        </div>
      </div>

      <div
        className="absolute inset-x-0 bottom-0 h-14"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          const idx = Math.round(ratio * (trend.length - 1));
          setHoverIdx(Math.min(trend.length - 1, Math.max(0, idx)));
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <ApexChart
          type="area"
          series={[{ name: label, data: trend }]}
          options={sparkOptions}
          height="100%"
        />
      </div>
    </div>
  );
}
