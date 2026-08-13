import { Activity, ArrowUpRight, Clock, Container, Truck, type LucideIcon } from 'lucide-react';
import { liveOps } from '@/data/dashboardData';
import { useCountUp } from '@/hooks/useCountUp';
import { Skeleton } from './DashboardSkeleton';
import { IconChip } from '../Display/IconChip/IconChip';

type Node = {
  icon: LucideIcon;
  label: string;
  value: number;
  suffix?: string;
  decimals?: number;
  accent?: boolean;
};

const nodes: Node[] = [
  { icon: Truck, label: 'In transit', value: liveOps.inTransit },
  { icon: Container, label: 'At port', value: liveOps.atPort },
  { icon: Clock, label: 'Awaiting return', value: liveOps.awaitingReturn, accent: true },
  { icon: Activity, label: 'On-time', value: liveOps.onTimeRate, suffix: '%', decimals: 1 },
];

function RouteNode({
  node,
  index,
  isLast,
  ready,
}: {
  node: Node;
  index: number;
  isLast: boolean;
  ready: boolean;
}) {
  const animated = useCountUp(node.value, ready);
  const { icon: Icon, accent } = node;

  return (
    <div className="relative flex flex-col items-center lg:flex-1">
      {!isLast && (
        <div className="absolute left-[calc(50%+28px)] top-6 hidden h-px w-[calc(100%-56px)] lg:block">
          <span className="route-line absolute inset-0 text-white/30" />
          <span
            className="route-pulse absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-subtle shadow-[0_0_8px_2px_rgba(249,172,23,0.55)]"
            style={{ ['--d' as string]: `${index * 750}ms` }}
          />
        </div>
      )}

      <IconChip
        icon={Icon}
        className={`relative z-10 ring-4 transition-transform duration-200 hover:scale-105 ${
          accent
            ? 'bg-accent text-accent-foreground ring-accent/25'
            : 'bg-white text-[var(--fl-neutral-950)] ring-white/20'
        }`}
      />

      <div className="mt-2.5 text-center type-label text-white/60">
        {node.label}
      </div>

      {ready ? (
        <div className="mt-0.5 text-center type-display text-white tabular-nums">
          {animated.toFixed(node.decimals ?? 0)}
          {node.suffix && (
            <span className="ml-0.5 type-body-sm font-medium text-white/70">{node.suffix}</span>
          )}
        </div>
      ) : (
        <Skeleton onDark className="mt-1.5 h-6 w-14" />
      )}
    </div>
  );
}

function VolumeBars({ ready }: { ready: boolean }) {
  const max = Math.max(...liveOps.weeklyVolume.map((w) => w.count));

  return (
    <div className="hidden shrink-0 sm:block">
      <div className="mb-2 flex items-baseline justify-between gap-6">
        <span className="type-label text-white/60">
          Weekly volume
        </span>
        <span className="flex items-center gap-1 type-body-xs text-accent">
          <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} />
          +14%
        </span>
      </div>
      <div className="flex h-14 items-end gap-1.5">
        {liveOps.weeklyVolume.map((w, i) => (
          <div key={w.week} className="group/bar relative flex h-full w-5 items-end">
            {ready ? (
              <div
                className="animate-rise w-full rounded-sm bg-white/25 transition-colors group-hover/bar:bg-accent"
                style={{
                  height: `${(w.count / max) * 100}%`,
                  ['--d' as string]: `${400 + i * 55}ms`,
                }}
                title={`${w.week}: ${w.count} bookings`}
              />
            ) : (
              <Skeleton onDark className="w-full" style={{ height: `${(w.count / max) * 100}%` }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CommandBarCard({ ready = true }: { ready?: boolean }) {
  return (
    <section className="relative overflow-hidden rounded-lg bg-gradient-to-br from-[var(--fl-teal-900,#2c474b)] via-[var(--fl-teal-800,#37595e)] to-[var(--fl-teal-950,#192a2d)] text-white shadow-md">
      <div className="relative p-6 lg:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between sm:gap-10">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="relative flex h-1.5 w-1.5 text-success">
                <span className="pulse-ring absolute inset-0" />
                <span className="relative h-1.5 w-1.5 rounded-full bg-success" />
              </span>
              <span className="type-label text-success">
                Live operations
              </span>
              <span className="type-caption text-white/50">· synced {liveOps.updatedAt}</span>
            </div>
            <h2 className="mt-2.5 type-h1 text-white">
              Doraleh corridor running at{' '}
              {/* Solid accent, not `-subtle`: this band is fixed-dark in both
                  themes (see the `text-white` siblings), and `--accent-subtle`
                  is a 14% wash in dark, which rendered this invisible. */}
              <span className="text-accent">{liveOps.onTimeRate}% on-time</span>
            </h2>
            <p className="mt-2 type-body-sm text-white/70">
              154 containers awaiting empty return · 6 flagged overdue
            </p>
          </div>

          <VolumeBars ready={ready} />
        </div>

        <div className="mt-7 grid grid-cols-2 gap-y-7 border-t border-white/15 pt-7 lg:flex lg:items-start">
          {nodes.map((node, i) => (
            <RouteNode
              key={node.label}
              node={node}
              index={i}
              isLast={i === nodes.length - 1}
              ready={ready}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
