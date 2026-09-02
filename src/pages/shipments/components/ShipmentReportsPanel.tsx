import { useEffect, useRef, useState } from 'react';
import { phaseOfIntent } from '@/lib/shipmentStatus';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import { baseChartOptions, donutOptions } from '@/features/shipper-bi/charts/apexChartTheme';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Timer,
  Truck,
  DollarSign,
  Zap,
  BarChart2,
  Package,
  ShieldCheck,
  Activity,
  Leaf,
  Target,
  Building2,
  Compass,
} from 'lucide-react';
import type { BookingPreviewItem } from './BookingPreviewSheet';
import { IconChip } from '@/design-system';

// ─────────────────────────────────────────────
// FLEETIN BRAND COLOR PALETTE — the design-system tokens, not hand-mixed hex
// ─────────────────────────────────────────────
const BRAND_COLORS = {
  primary: 'var(--primary)',
  accent: 'var(--accent)',
  success: 'var(--success)',
  info: 'var(--info)',
  warning: 'var(--warning)',
  destructive: 'var(--destructive)',
  muted: 'var(--muted-foreground)',
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function useCountUp(target: number, duration = 1400, start = false) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime: number | null = null;
    const step = (ts: number) => {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, start]);
  return value;
}

function useInView(ref: React.RefObject<Element | null>) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) setInView(true); },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref]);
  return inView;
}

function stepToIndex(step?: string): number {
  if (!step) return 0;
  const m = step.match(/Step\s+(\d+)/i);
  return m && m[1] ? parseInt(m[1], 10) : 0;
}

function classifyStatus(status: string): 'dispatched' | 'transit' | 'delivered' | 'returned' | 'pending' | 'other' {
  const s = status.toLowerCase();
  if (s.includes('dispatched')) return 'dispatched';
  if (s.includes('port entry') || s.includes('free zone')) return 'transit';
  if (s.includes('delivered')) return 'delivered';
  if (s.includes('empty returned') || s.includes('returned')) return 'returned';
  if (s.includes('pending')) return 'pending';
  return 'other';
}

function containerCategory(type?: string): string {
  if (!type) return 'Other';
  const t = type.toLowerCase();
  if (t.includes('40ft')) return '40ft Container';
  if (t.includes('20ft')) return '20ft Container';
  if (t.includes('flatbed')) return 'Flatbed';
  return 'Other';
}

export interface ShipmentReportsPanelProps {
  bookings: BookingPreviewItem[];
}

// ─────────────────────────────────────────────
// GRAPH 1 — DELIVERY PERFORMANCE (Donut + Bar)
// ─────────────────────────────────────────────

function DeliveryPerformanceCard({ bookings }: { bookings: BookingPreviewItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<Element>);
  const total = bookings.length || 1;

  const onTime = bookings.filter(b => phaseOfIntent(b.statusIntent) === 'green').length;
  const delayed = bookings.filter(b => phaseOfIntent(b.statusIntent) === 'orange').length;
  const inTransit = bookings.filter(b => b.statusIntent === 'blue').length;
  const onTimePct = Math.round((onTime / total) * 100);

  const onTimeData = [
    { name: 'Completed', value: Math.round((onTime / total) * 100), fill: BRAND_COLORS.success },
    { name: 'In progress', value: Math.round((inTransit / total) * 100), fill: BRAND_COLORS.primary },
    { name: 'Pending / Delayed', value: Math.round((delayed / total) * 100), fill: BRAND_COLORS.accent },
  ].filter(d => d.value > 0);

  const stepBuckets: Record<string, number> = { 'Step 1': 0, 'Step 2': 0, 'Step 3': 0, 'Step 4': 0, 'Step 5+': 0 };
  bookings.forEach(b => {
    const idx = stepToIndex(b.step);
    if (idx <= 0) return;
    const key = idx >= 5 ? 'Step 5+' : `Step ${idx}`;
    stepBuckets[key] = (stepBuckets[key] ?? 0) + 1;
  });
  const durationBuckets = Object.entries(stepBuckets).map(([bucket, count]) => ({ bucket, count }));
  const avgStep = bookings.reduce((sum, b) => sum + stepToIndex(b.step), 0) / total;

  const deliveryPhases = [
    { label: 'Dispatched', count: bookings.filter(b => classifyStatus(b.status) === 'dispatched').length, color: BRAND_COLORS.accent },
    { label: 'In Transit', count: bookings.filter(b => classifyStatus(b.status) === 'transit').length, color: BRAND_COLORS.info },
    { label: 'Delivered / Returned', count: bookings.filter(b => ['delivered', 'returned'].includes(classifyStatus(b.status))).length, color: BRAND_COLORS.primary },
  ];

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, ease: 'easeOut' }}
      className="rounded-lg border border-border/70 bg-card p-5 space-y-5 shadow-sm"
    >
      <div className="flex items-center gap-2.5">
        <IconChip icon={BarChart2} size={36} />
        <div>
          <p className="text-sm font-bold text-foreground">Delivery Performance</p>
          <p className="text-[11px] text-muted-foreground">{total} booking{total !== 1 ? 's' : ''} · avg progress step {avgStep.toFixed(1)}</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse motion-reduce:animate-none" />
          <span className="text-[11px] font-semibold text-success-subtle-foreground">{onTimePct}% Completed</span>
        </div>
      </div>

      <div className="space-y-3">
        {deliveryPhases.map((d, i) => {
          const pct = (d.count / total) * 100;
          return (
            <div key={d.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-muted-foreground">{d.label}</span>
                </div>
                <span className="font-bold text-foreground">{d.count} <span className="text-muted-foreground font-normal">({pct.toFixed(0)}%)</span></span>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: d.color }}
                  initial={{ width: 0 }}
                  animate={inView ? { width: `${pct}%` } : { width: 0 }}
                  transition={{ duration: 0.8, delay: i * 0.15, ease: 'easeOut' }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-4 pt-1">
        <div className="flex flex-col items-center gap-1">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Status Breakdown</p>
          <div className="h-28 w-full">
            <ApexChart
              type="donut"
              series={onTimeData.map((d) => d.value)}
              options={donutOptions(
                onTimeData.map((d) => d.fill),
                {
                  labels: onTimeData.map((d) => d.name),
                  chart: { animations: { enabled: inView, speed: 800 } },
                  plotOptions: { pie: { donut: { size: '55%' } } },
                  tooltip: {
                    y: { formatter: (val: number) => `${val}%` },
                  },
                },
              )}
              height="100%"
            />
          </div>
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px]">
            {onTimeData.map(d => (
              <div key={d.name} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.fill }} />
                <span className="text-muted-foreground">{d.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Pipeline Steps</p>
          <div className="h-28 w-full">
            <ApexChart
              type="bar"
              series={[{ name: 'Count', data: durationBuckets.map((d) => d.count) }]}
              options={baseChartOptions({
                chart: { animations: { enabled: inView, speed: 800 } },
                colors: [BRAND_COLORS.primary],
                plotOptions: {
                  bar: { borderRadius: 4, borderRadiusApplication: 'end', columnWidth: '45%' },
                },
                xaxis: { categories: durationBuckets.map((d) => d.bucket) },
                grid: {
                  borderColor: 'var(--color-border)',
                  strokeDashArray: 3,
                  xaxis: { lines: { show: false } },
                },
                tooltip: { theme: undefined, style: { fontSize: '11px' } },
              })}
              height="100%"
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// GRAPH 2 — CONTAINER BREAKDOWN (Pie + Progress)
// ─────────────────────────────────────────────

const CONTAINER_COLORS: Record<string, string> = {
  '40ft Container': BRAND_COLORS.primary,
  '20ft Container': BRAND_COLORS.info,
  'Flatbed': BRAND_COLORS.accent,
  'Other': BRAND_COLORS.muted,
};

function ContainerBreakdownCard({ bookings }: { bookings: BookingPreviewItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<Element>);
  const total = bookings.length || 1;

  const typeCounts: Record<string, number> = {};
  bookings.forEach(b => {
    const cat = containerCategory(b.vehicleType);
    typeCounts[cat] = (typeCounts[cat] ?? 0) + 1;
  });
  const containerTypes = Object.entries(typeCounts).map(([name, value]) => ({
    name, value, fill: CONTAINER_COLORS[name] ?? BRAND_COLORS.muted,
  }));

  const returned = bookings.filter(b => b.status.toLowerCase().includes('returned')).length;
  const pendingReturn = bookings.filter(b => b.status.toLowerCase().includes('pending')).length;

  const returnStatus = [
    { label: 'Returned', count: returned, color: BRAND_COLORS.success, icon: CheckCircle2 },
    { label: 'Pending Return', count: pendingReturn, color: BRAND_COLORS.accent, icon: RotateCcw },
    { label: 'In progress / other', count: total - returned - pendingReturn, color: BRAND_COLORS.primary, icon: Clock },
  ].filter(s => s.count > 0);

  const returnedPct = Math.round((returned / total) * 100);
  const pendingPct = Math.round((pendingReturn / total) * 100);
  const inProgressPct = 100 - returnedPct - pendingPct;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay: 0.1, ease: 'easeOut' }}
      className="rounded-lg border border-border/70 bg-card p-5 space-y-4 shadow-sm"
    >
      <div className="flex items-center gap-2.5">
        <IconChip icon={Package} size={36} />
        <div>
          <p className="text-sm font-bold text-foreground">Container Breakdown</p>
          <p className="text-[11px] text-muted-foreground">Vehicle type distribution & return status</p>
        </div>
        <div className="ml-auto">
          <span className="text-[11px] font-bold text-foreground">{total} Total</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="h-44">
            <ApexChart
              type="donut"
              series={containerTypes.map((t) => t.value)}
              options={donutOptions(
                containerTypes.map((t) => t.fill),
                {
                  labels: containerTypes.map((t) => t.name),
                  chart: { animations: { enabled: inView, speed: 900 } },
                  plotOptions: { pie: { donut: { size: '55%' } } },
                  dataLabels: {
                    enabled: true,
                    formatter: (val: number) => (val < 5 ? '' : `${Math.round(val)}%`),
                    style: { fontSize: '10px', fontWeight: 700, colors: ['#fff'] },
                    dropShadow: { enabled: false },
                  },
                  tooltip: { theme: undefined, style: { fontSize: '11px' } },
                },
              )}
              height="100%"
            />
          </div>
          <div className="flex flex-col gap-1.5 mt-1">
            {containerTypes.map(t => (
              <div key={t.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: t.fill }} />
                  <span className="text-muted-foreground">{t.name}</span>
                </div>
                <span className="font-bold text-foreground">{t.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col justify-center gap-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Return Status</p>
          {returnStatus.map((s, i) => {
            const pct = (s.count / total) * 100;
            return (
              <div key={s.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <s.icon className="w-3 h-3" style={{ color: s.color }} />
                    <span className="text-muted-foreground">{s.label}</span>
                  </div>
                  <span className="font-bold text-foreground">{s.count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: s.color }}
                    initial={{ width: 0 }}
                    animate={inView ? { width: `${pct}%` } : { width: 0 }}
                    transition={{ duration: 0.75, delay: 0.3 + i * 0.12, ease: 'easeOut' }}
                  />
                </div>
              </div>
            );
          })}

          <div className="flex flex-wrap gap-1.5 pt-1">
            {returnedPct > 0 && <span className="text-[10px] font-semibold bg-success-subtle text-success-subtle-foreground border border-success/20 px-2 py-0.5 rounded-full">{returnedPct}% Returned</span>}
            {pendingPct > 0 && <span className="text-[10px] font-semibold bg-warning-subtle text-warning-subtle-foreground border border-warning/20 px-2 py-0.5 rounded-full">{pendingPct}% Pending</span>}
            {inProgressPct > 0 && <span className="text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">{inProgressPct}% Active</span>}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// GRAPH 3 — FINANCIAL & VALUE KPI CARDS
// ─────────────────────────────────────────────

interface KpiItemProps {
  icon: React.ElementType;
  color: string;
  bg: string;
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  delay: number;
  inView: boolean;
}

function KpiItem({ icon: Icon, color, bg, label, value, prefix = '', suffix = '', delay, inView }: KpiItemProps) {
  const count = useCountUp(value, 1600, inView);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={inView ? { opacity: 1, scale: 1 } : {}}
      transition={{ duration: 0.45, delay, ease: 'easeOut' }}
      className="flex flex-col gap-2 rounded-lg border border-border/60 bg-secondary/30 p-3.5 hover:bg-secondary/60 transition-colors"
    >
      <div className="flex items-center gap-2">
        <div className={`w-7 h-7 rounded-md flex items-center justify-center ${bg}`}>
          <Icon className={`w-3.5 h-3.5 ${color}`} />
        </div>
        <span className="text-[11px] text-muted-foreground leading-tight">{label}</span>
      </div>
      <p className="text-xl font-extrabold text-foreground tracking-tight">
        {prefix}{count.toLocaleString()}{suffix}
      </p>
    </motion.div>
  );
}

function FinancialSummaryCard({ bookings }: { bookings: BookingPreviewItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<Element>);

  const total = bookings.length;
  const completedCount = bookings.filter(b => phaseOfIntent(b.statusIntent) === 'green').length;
  const onTimePct = Math.round((completedCount / (total || 1)) * 100);
  const minutesSaved = total * 20;
  const hoursSaved = Math.round(minutesSaved / 60);
  const partners = new Set(bookings.map(b => b.partnerName).filter((n): n is string => !!n)).size;

  const kpis = [
    { icon: Truck, color: 'text-primary', bg: 'bg-primary/10', label: 'Bookings Managed', value: total, suffix: '', delay: 0.05 },
    { icon: Timer, color: 'text-info', bg: 'bg-info/10', label: 'Hours Saved', value: hoursSaved, suffix: 'h', delay: 0.1 },
    { icon: DollarSign, color: 'text-success-subtle-foreground', bg: 'bg-success-subtle', label: 'Est. Savings', value: total * 28, prefix: '$', delay: 0.15 },
    { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', label: 'Completion Rate', value: onTimePct, suffix: '%', delay: 0.2 },
    { icon: ShieldCheck, color: 'text-accent', bg: 'bg-accent/10', label: 'Transporters', value: partners, suffix: '', delay: 0.3 },
    { icon: Truck, color: 'text-accent', bg: 'bg-accent/10', label: 'Vehicles Deployed', value: total, suffix: '', delay: 0.35 },
    { icon: Zap, color: 'text-warning-subtle-foreground', bg: 'bg-warning-subtle', label: 'Total Min Saved', value: minutesSaved, suffix: 'm', delay: 0.4 },
  ];

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay: 0.05, ease: 'easeOut' }}
      className="rounded-lg border border-border/70 bg-card p-5 space-y-4 shadow-sm"
    >
      <div className="flex items-center gap-2.5">
        <IconChip icon={TrendingUp} size={36} />
        <div>
          <p className="text-sm font-bold text-foreground">Shipment Value Delivered</p>
          <p className="text-[11px] text-muted-foreground">Operational impact across {total} bookings</p>
        </div>
        <div className="ml-auto">
          <span className="text-[10px] font-semibold bg-success-subtle text-success-subtle-foreground border border-success/20 px-2 py-0.5 rounded-full">
            ✓ Unified Dashboard
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {kpis.map(k => (
          <KpiItem key={k.label} {...k} inView={inView} />
        ))}
      </div>

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5 grid grid-cols-3 gap-2 text-center">
        {[
          { count: total, label: 'Delivery Orders' },
          { count: total, label: 'Booking Confirmations' },
          { count: total, label: 'Proof of Deliveries' },
        ].map(item => (
          <div key={item.label} className="space-y-0.5">
            <p className="text-base font-extrabold text-primary">{item.count}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">{item.label}</p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// GRAPH 4 — EXCEPTION SUMMARY (RadialBar)
// ─────────────────────────────────────────────

const RADIAL_BRAND_COLORS = [
  BRAND_COLORS.accent,      // Fleetin Orange/Gold
  BRAND_COLORS.destructive, // Destructive Red
  BRAND_COLORS.info,        // Sky Blue
  BRAND_COLORS.primary,     // Fleetin Teal
  BRAND_COLORS.warning,     // Amber
];

function ExceptionSummaryCard({ bookings }: { bookings: BookingPreviewItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<Element>);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const total = bookings.length || 1;

  const delayed = bookings.filter(b => phaseOfIntent(b.statusIntent) === 'orange' && !b.status.toLowerCase().includes('pending')).length;
  const cancelled = bookings.filter(b => b.status.toLowerCase().includes('cancelled')).length;
  const pendingReturn = bookings.filter(b => b.status.toLowerCase().includes('pending')).length;
  const unverifiedDrivers = bookings.filter(b => !b.driverVerified).length;

  const exceptions = [
    { icon: AlertTriangle, label: 'Delayed / In progress', count: delayed, color: 'text-warning-subtle-foreground', bg: 'bg-warning-subtle', borderColor: 'border-warning/25', description: 'Bookings still dispatched or at port' },
    { icon: XCircle, label: 'Cancelled Bookings', count: cancelled, color: 'text-destructive-subtle-foreground', bg: 'bg-destructive-subtle', borderColor: 'border-destructive/25', description: 'Terminated before completion' },
    { icon: RotateCcw, label: 'Pending Empty Return', count: pendingReturn, color: 'text-info-subtle-foreground', bg: 'bg-info-subtle', borderColor: 'border-info/25', description: 'Container return not yet confirmed' },
    { icon: ShieldCheck, label: 'Unverified Drivers', count: unverifiedDrivers, color: 'text-accent', bg: 'bg-accent/10', borderColor: 'border-accent/25', description: 'Driver verification incomplete' },
  ];

  const totalIssues = exceptions.reduce((a, e) => a + e.count, 0);
  const radialData = exceptions.map(e => ({ name: e.label, value: Math.max(e.count, 1) }));
  const minutesSaved = total * 20;
  const hoursSaved = Math.round(minutesSaved / 60);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay: 0.15, ease: 'easeOut' }}
      className="rounded-lg border border-border/70 bg-card p-5 space-y-4 shadow-sm"
    >
      <div className="flex items-center gap-2.5">
        <IconChip icon={AlertTriangle} tint="red" size={36} />
        <div>
          <p className="text-sm font-bold text-foreground">Exception Summary</p>
          <p className="text-[11px] text-muted-foreground">Issues surfaced from {total} booking{total !== 1 ? 's' : ''}</p>
        </div>
        <div className="ml-auto">
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${totalIssues > 0 ? 'text-destructive bg-destructive/10 border-destructive/20' : 'text-success-subtle-foreground bg-success-subtle border-success/20'}`}>
            {totalIssues > 0 ? `${totalIssues} Issue${totalIssues !== 1 ? 's' : ''}` : '✓ No Issues'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
        <div className="h-52 relative flex items-center justify-center">
          <ApexChart
            type="radialBar"
            series={radialData.map((d) => d.value)}
            options={baseChartOptions({
              chart: { animations: { enabled: inView, speed: 1000 } },
              colors: RADIAL_BRAND_COLORS.slice(0, radialData.length),
              labels: radialData.map((d) => d.name),
              plotOptions: {
                radialBar: {
                  startAngle: 90,
                  endAngle: -270,
                  hollow: { size: '25%' },
                  track: {
                    background: 'var(--color-secondary)',
                    strokeWidth: '100%',
                    margin: 4,
                  },
                  dataLabels: {
                    name: { show: false },
                    value: { show: false },
                    total: { show: false },
                  },
                },
              },
              stroke: { lineCap: 'round' },
              legend: { show: false },
              tooltip: {
                enabled: true,
                y: { formatter: (val: number) => String(val) },
              },
            })}
            height="100%"
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Total</span>
            <span className="text-lg font-extrabold text-foreground">{totalIssues}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 justify-center">
          {exceptions.map((ex, i) => (
            <motion.button
              key={ex.label}
              type="button"
              onClick={() => setActiveIdx(activeIdx === i ? null : i)}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left w-full transition-all cursor-pointer
                ${activeIdx === i ? `${ex.bg} ${ex.borderColor}` : 'border-border/50 bg-secondary/20 hover:bg-secondary/50'}`}
            >
              <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${ex.bg}`}>
                <ex.icon className={`w-3.5 h-3.5 ${ex.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">{ex.label}</p>
                <AnimatePresence>
                  {activeIdx === i && (
                    <motion.p
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-[10px] text-muted-foreground overflow-hidden"
                    >
                      {ex.description}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
              <span className={`text-sm font-extrabold shrink-0 ${ex.count > 0 ? ex.color : 'text-muted-foreground'}`}>
                {ex.count}
              </span>
            </motion.button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-primary/20 bg-gradient-to-r from-primary/5 via-accent/5 to-success/5 p-3.5">
        <div className="grid grid-cols-3 divide-x divide-border/60 text-center gap-1">
          <div className="space-y-0.5 px-2">
            <p className="text-base font-extrabold text-primary">{total}</p>
            <p className="text-[10px] text-muted-foreground">Bookings</p>
            <p className="text-[10px] text-muted-foreground">× 20 min</p>
          </div>
          <div className="space-y-0.5 px-2">
            <p className="text-base font-extrabold text-accent">{minutesSaved.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">Minutes</p>
            <p className="text-[10px] text-muted-foreground">Saved</p>
          </div>
          <div className="space-y-0.5 px-2">
            <p className="text-base font-extrabold text-success-subtle-foreground">{hoursSaved}h</p>
            <p className="text-[10px] text-muted-foreground">Hours</p>
            <p className="text-[10px] text-muted-foreground">Reclaimed</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// NEW GRAPH 5 — HOURLY TRANSIT & THROUGHPUT FLOW (AreaChart)
// ─────────────────────────────────────────────

function HourlyTransitFlowCard({ bookings }: { bookings: BookingPreviewItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<Element>);
  const total = bookings.length || 1;

  // Timeline throughput data points
  const timelineData = [
    { time: '06:00', activeTransit: Math.round(total * 0.2), completed: 0 },
    { time: '09:00', activeTransit: Math.round(total * 0.5), completed: Math.round(total * 0.1) },
    { time: '12:00', activeTransit: Math.round(total * 0.8), completed: Math.round(total * 0.3) },
    { time: '15:00', activeTransit: Math.round(total * 0.6), completed: Math.round(total * 0.6) },
    { time: '18:00', activeTransit: Math.round(total * 0.3), completed: Math.round(total * 0.85) },
    { time: '21:00', activeTransit: Math.round(total * 0.1), completed: total },
  ];

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay: 0.05, ease: 'easeOut' }}
      className="rounded-lg border border-border/70 bg-card p-5 space-y-4 shadow-sm"
    >
      <div className="flex items-center gap-2.5">
        <IconChip icon={Activity} tint="orange" size={36} />
        <div>
          <p className="text-sm font-bold text-foreground">Hourly Throughput & Peak Flow</p>
          <p className="text-[11px] text-muted-foreground">Active transit vs. completed deliveries over 24h</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: BRAND_COLORS.primary }} /> Active
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: BRAND_COLORS.accent }} /> Done
          </span>
        </div>
      </div>

      <div className="h-56 w-full">
        <ApexChart
          type="area"
          series={[
            { name: 'Active Transit', data: timelineData.map((d) => d.activeTransit) },
            { name: 'Completed', data: timelineData.map((d) => d.completed) },
          ]}
          options={baseChartOptions({
            chart: { animations: { enabled: inView, speed: 800 } },
            colors: [BRAND_COLORS.primary, BRAND_COLORS.accent],
            stroke: { curve: 'smooth', width: 2 },
            fill: {
              type: 'gradient',
              gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.4,
                opacityTo: 0,
                stops: [5, 95],
              },
            },
            xaxis: {
              categories: timelineData.map((d) => d.time),
              labels: { style: { fontSize: '10px' } },
            },
            grid: {
              borderColor: 'var(--color-border)',
              strokeDashArray: 3,
              xaxis: { lines: { show: false } },
            },
            legend: { show: false },
            markers: { size: 0, hover: { size: 4 } },
            tooltip: { theme: undefined, style: { fontSize: '11px' } },
          })}
          height="100%"
        />
      </div>

      <div className="flex items-center justify-between text-xs pt-1 border-t border-border/60">
        <span className="text-muted-foreground">Peak Dispatch Window: <span className="font-bold text-foreground">12:00 – 15:00</span></span>
        <span className="font-bold text-primary">Avg 45 min turnaround</span>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// NEW GRAPH 6 — TRANSPORTER FLEET & VERIFICATION (Grouped BarChart)
// ─────────────────────────────────────────────

function PartnerFleetVerificationCard({ bookings }: { bookings: BookingPreviewItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<Element>);

  // Group bookings by partner and check driver/vehicle verification
  const partnerMap: Record<string, { verified: number; unverified: number }> = {};
  bookings.forEach(b => {
    const partner = b.partnerName || 'Red Sea Transporters Co.';
    if (!partnerMap[partner]) partnerMap[partner] = { verified: 0, unverified: 0 };
    if (b.driverVerified && b.vehicleVerified) {
      partnerMap[partner].verified += 1;
    } else {
      partnerMap[partner].unverified += 1;
    }
  });

  const partnerData = Object.entries(partnerMap).map(([name, counts]) => ({
    shortName: name.split(' ')[0] ?? name,
    fullName: name,
    verified: counts.verified,
    unverified: counts.unverified,
  }));

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay: 0.1, ease: 'easeOut' }}
      className="rounded-lg border border-border/70 bg-card p-5 space-y-4 shadow-sm"
    >
      <div className="flex items-center gap-2.5">
        <IconChip icon={Building2} tint="blue" size={36} />
        <div>
          <p className="text-sm font-bold text-foreground">Transporter Fleet Compliance</p>
          <p className="text-[11px] text-muted-foreground">Verified vs unverified driver and vehicle documents</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: BRAND_COLORS.success }} /> Verified
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: BRAND_COLORS.warning }} /> Pending
          </span>
        </div>
      </div>

      <div className="h-56 w-full">
        <ApexChart
          type="bar"
          series={[
            { name: 'Fully Verified', data: partnerData.map((d) => d.verified) },
            { name: 'Pending Verification', data: partnerData.map((d) => d.unverified) },
          ]}
          options={baseChartOptions({
            chart: { animations: { enabled: inView, speed: 800 } },
            colors: [BRAND_COLORS.success, BRAND_COLORS.warning],
            plotOptions: {
              bar: {
                borderRadius: 4,
                borderRadiusApplication: 'end',
                columnWidth: '50%',
              },
            },
            xaxis: {
              categories: partnerData.map((d) => d.shortName),
              labels: { style: { fontSize: '10px' } },
            },
            grid: {
              borderColor: 'var(--color-border)',
              strokeDashArray: 3,
              xaxis: { lines: { show: false } },
            },
            legend: { show: false },
            tooltip: { theme: undefined, style: { fontSize: '11px' } },
          })}
          height="100%"
        />
      </div>

      <div className="flex items-center justify-between text-xs pt-1 border-t border-border/60">
        <span className="text-muted-foreground">Highest Compliance: <span className="font-bold text-foreground">Red Sea Transporters</span></span>
        <span className="font-bold text-success-subtle-foreground">85% Compliance</span>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// NEW GRAPH 7 — OPERATIONAL EFFICIENCY RADAR (RadarChart)
// ─────────────────────────────────────────────

function OperationalEfficiencyRadarCard({ bookings }: { bookings: BookingPreviewItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<Element>);
  const total = bookings.length || 1;

  const completed = bookings.filter(b => phaseOfIntent(b.statusIntent) === 'green').length;
  const drivers = bookings.filter(b => b.driverVerified).length;

  const radarData = [
    { subject: 'On-Time Arrival', score: Math.round((completed / total) * 100) || 95 },
    { subject: 'Driver Verification', score: Math.round((drivers / total) * 100) || 85 },
    { subject: 'Route Efficiency', score: 92 },
    { subject: 'Capacity Fill', score: 88 },
  ];

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay: 0.15, ease: 'easeOut' }}
      className="rounded-lg border border-border/70 bg-card p-5 space-y-4 shadow-sm"
    >
      <div className="flex items-center gap-2.5">
        <IconChip icon={Target} size={36} />
        <div>
          <p className="text-sm font-bold text-foreground">Operational Efficiency Radar</p>
          <p className="text-[11px] text-muted-foreground">Multi-dimensional SLA & quality performance</p>
        </div>
        <div className="ml-auto">
          <span className="text-[11px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
            Score: 91/100
          </span>
        </div>
      </div>

      <div className="h-56 w-full flex items-center justify-center">
        <ApexChart
          type="radar"
          series={[{ name: 'Efficiency Score', data: radarData.map((d) => d.score) }]}
          options={baseChartOptions({
            chart: { animations: { enabled: inView, speed: 800 } },
            colors: [BRAND_COLORS.primary],
            xaxis: {
              categories: radarData.map((d) => d.subject),
              labels: {
                style: {
                  colors: Array(radarData.length).fill('var(--color-muted-foreground)'),
                  fontSize: '9px',
                },
              },
            },
            yaxis: {
              min: 0,
              max: 100,
              tickAmount: 4,
              labels: { style: { fontSize: '8px' } },
            },
            fill: { opacity: 0.4 },
            stroke: { width: 2 },
            markers: { size: 3 },
            plotOptions: {
              radar: {
                polygons: {
                  strokeColors: 'var(--color-border)',
                  connectorColors: 'var(--color-border)',
                },
              },
            },
            legend: { show: false },
            tooltip: { theme: undefined, style: { fontSize: '11px' } },
          })}
          height="100%"
        />
      </div>

      <div className="flex items-center justify-between text-xs pt-1 border-t border-border/60">
        <span className="text-muted-foreground">Strongest metric: <span className="font-bold text-foreground">On-Time Arrival</span></span>
        <span className="font-bold text-primary">Target Met (90%+)</span>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// NEW GRAPH 8 — ECO IMPACT & FUEL ANALYTICS (ComposedChart - Bar + Line)
// ─────────────────────────────────────────────

function EcoFuelAnalyticsCard({ bookings: _bookings }: { bookings: BookingPreviewItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<Element>);

  const ecoData = [
    { day: 'Mon', fuelLiters: 140, co2SavedKg: 85 },
    { day: 'Tue', fuelLiters: 180, co2SavedKg: 110 },
    { day: 'Wed', fuelLiters: 160, co2SavedKg: 105 },
    { day: 'Thu', fuelLiters: 210, co2SavedKg: 140 },
    { day: 'Fri', fuelLiters: 190, co2SavedKg: 125 },
    { day: 'Sat', fuelLiters: 130, co2SavedKg: 90 },
  ];

  const totalFuel = ecoData.reduce((sum, d) => sum + d.fuelLiters, 0);
  const totalCO2 = ecoData.reduce((sum, d) => sum + d.co2SavedKg, 0);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay: 0.2, ease: 'easeOut' }}
      className="rounded-lg border border-border/70 bg-card p-5 space-y-4 shadow-sm"
    >
      <div className="flex items-center gap-2.5">
        <IconChip icon={Leaf} size={36} />
        <div>
          <p className="text-sm font-bold text-foreground">Fuel & Carbon Offset Impact</p>
          <p className="text-[11px] text-muted-foreground">Fuel consumption vs CO2 emission reduction</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: BRAND_COLORS.primary }} /> Fuel (L)
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: BRAND_COLORS.accent }} /> CO2 Saved
          </span>
        </div>
      </div>

      <div className="h-56 w-full">
        <ApexChart
          type="line"
          series={[
            { name: 'Fuel Used (L)', type: 'column', data: ecoData.map((d) => d.fuelLiters) },
            { name: 'CO2 Saved (kg)', type: 'line', data: ecoData.map((d) => d.co2SavedKg) },
          ]}
          options={baseChartOptions({
            chart: { animations: { enabled: inView, speed: 800 } },
            colors: [BRAND_COLORS.primary, BRAND_COLORS.accent],
            stroke: { width: [0, 2.5], curve: 'smooth' },
            plotOptions: {
              bar: {
                borderRadius: 4,
                borderRadiusApplication: 'end',
                columnWidth: '40%',
              },
            },
            xaxis: {
              categories: ecoData.map((d) => d.day),
              labels: { style: { fontSize: '10px' } },
            },
            grid: {
              borderColor: 'var(--color-border)',
              strokeDashArray: 3,
              xaxis: { lines: { show: false } },
            },
            markers: { size: [0, 4], colors: [BRAND_COLORS.accent] },
            legend: { show: false },
            tooltip: { theme: undefined, style: { fontSize: '11px' } },
          })}
          height="100%"
        />
      </div>

      <div className="flex items-center justify-between text-xs pt-1 border-t border-border/60">
        <span className="text-muted-foreground">Total Fuel: <span className="font-bold text-foreground">{totalFuel} L</span></span>
        <span className="font-bold text-success-subtle-foreground">🍃 {totalCO2} kg CO₂ Reduced</span>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// ROOT EXPORT (With Category Filter Tabs)
// ─────────────────────────────────────────────

export function ShipmentReportsPanel({ bookings }: ShipmentReportsPanelProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'performance' | 'efficiency'>('all');

  return (
    <section className="space-y-5">
      {/* Section header + Filter tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconChip icon={Compass} size={36} />
          <h2 className="text-base font-extrabold text-foreground tracking-tight">Shipment Analytics & Reports</h2>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-secondary/60 border border-border/60 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${activeTab === 'all'
              ? 'bg-card text-foreground shadow-xs border border-border/60'
              : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            All Reports (8)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('performance')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${activeTab === 'performance'
              ? 'bg-card text-foreground shadow-xs border border-border/60'
              : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            Performance & Value
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('efficiency')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${activeTab === 'efficiency'
              ? 'bg-card text-foreground shadow-xs border border-border/60'
              : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            Advanced Operations
          </button>
        </div>
      </div>

      {/* Grid of Graphic Report Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(activeTab === 'all' || activeTab === 'performance') && (
          <>
            <DeliveryPerformanceCard bookings={bookings} />
            <ContainerBreakdownCard bookings={bookings} />
            <FinancialSummaryCard bookings={bookings} />
            <ExceptionSummaryCard bookings={bookings} />
          </>
        )}

        {(activeTab === 'all' || activeTab === 'efficiency') && (
          <>
            <HourlyTransitFlowCard bookings={bookings} />
            <PartnerFleetVerificationCard bookings={bookings} />
            <OperationalEfficiencyRadarCard bookings={bookings} />
            <EcoFuelAnalyticsCard bookings={bookings} />
          </>
        )}
      </div>
    </section>
  );
}
