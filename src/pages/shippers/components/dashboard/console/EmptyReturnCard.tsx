import { useMemo } from 'react';
import { AlertTriangle, ArrowRight, Container as ContainerIcon } from '@/design-system/icons';
import { Card, IconChip } from '@/design-system';
import { DELAY_OWNER_LABELS, type DelayOwner } from '@/features/shipper-bi/contracts';
import type { ShipperShipmentRow } from '@/features/shipper-bi';
import {
  DETENTION_RATE_CURRENCY,
  DETENTION_RATE_PER_CONTAINER_DAY,
} from '@/lib/bi/config';
import { cn } from '@/utils';
import { PANEL_SURFACE } from './PanelHeader';

/**
 * Empty return — the money leaving the account right now.
 *
 * This is the one panel on the dashboard that is allowed to shout. Every other
 * card reports; this one is a bill still running, and the reader is the only
 * person who can stop it. So it leads with the accruing cost rather than the
 * container count: "nine containers late" is a status, "$3,150 and climbing" is
 * a reason to pick up the phone.
 *
 * It answers three questions in one pass — how many, why, and what it costs —
 * because splitting them across three cards is what let the previous dashboard
 * bury the answer under a route bar chart nobody acted on.
 */

export interface EmptyReturnCardProps {
  rows: ShipperShipmentRow[];
  onOpenShipment: (row: ShipperShipmentRow) => void;
  onViewAll: () => void;
}

export function EmptyReturnCard({ rows, onOpenShipment, onViewAll }: EmptyReturnCardProps) {
  const model = useMemo(() => buildModel(rows), [rows]);

  const hasExposure = model.overdue.length > 0;

  return (
    <Card
      variant="default"
      padding="none"
      className={cn('overflow-hidden', PANEL_SURFACE)}
    >
      {/* ── Banner ─────────────────────────────────────────────────────
          A tinted band, not a plain header: the panel has to read as an
          exception the moment the page loads, before anything is parsed. */}
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-4 border-b px-7 py-6',
          hasExposure
            ? 'border-destructive/20 bg-destructive-subtle'
            : 'border-border-subtle bg-success-subtle',
        )}
      >
        <div className="flex min-w-0 items-center gap-3.5">
          <IconChip
            icon={hasExposure ? AlertTriangle : ContainerIcon}
            className={hasExposure ? undefined : 'bg-success text-success-foreground'}
            tint={hasExposure ? 'red' : 'teal'}
          />

          <div className="min-w-0">
            <h2 className="type-h3 text-foreground">Empty Return</h2>
            <p className="type-body-sm text-muted-foreground">
              {hasExposure
                ? `${model.overdue.length} container${model.overdue.length === 1 ? '' : 's'} past free time, accruing detention now`
                : 'Every container is back inside free time. Nothing accruing.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onViewAll}
          className="type-body-xs inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-3.5 py-2 text-foreground transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Review returns
          <ArrowRight className="size-3.5" aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-1 divide-y divide-border-subtle lg:grid-cols-12 lg:divide-x lg:divide-y-0">
        {/* ── The bill ───────────────────────────────────────────────── */}
        <div className="flex flex-col gap-6 p-7 lg:col-span-4">
          <div>
            <p className="type-label text-muted-foreground">Detention accruing</p>
            <p
              className={cn(
                'type-display-xl mt-2',
                hasExposure ? 'text-destructive' : 'text-foreground',
              )}
            >
              {formatUsd(model.detentionCost)}
            </p>
            <p className="type-body-xs mt-1.5 text-muted-foreground">
              {model.detentionDays.toLocaleString()} container-day
              {model.detentionDays === 1 ? '' : 's'} at {DETENTION_RATE_CURRENCY}{' '}
              {DETENTION_RATE_PER_CONTAINER_DAY}/day
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-3">
            <Stat
              label="Containers late"
              value={String(model.overdue.length)}
              intent={hasExposure ? 'bad' : 'neutral'}
            />
            <Stat
              label="Due within 48h"
              value={String(model.dueSoon.length)}
              intent={model.dueSoon.length > 0 ? 'warn' : 'neutral'}
            />
            <Stat
              label="Worst overrun"
              value={model.worstOverrunDays > 0 ? `${model.worstOverrunDays}d` : '\u2014'}
              intent={model.worstOverrunDays >= 7 ? 'bad' : 'neutral'}
            />
            <Stat
              label="Avg. cycle"
              value={model.avgCycleDays > 0 ? `${model.avgCycleDays.toFixed(1)}d` : '\u2014'}
              intent="neutral"
            />
          </dl>
        </div>

        {/* ── Why ────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-5 p-7 lg:col-span-4">
          <p className="type-label text-muted-foreground">What is holding them</p>

          {model.causes.length === 0 ? (
            <p className="type-body-sm text-muted-foreground">
              No delay attributed to these containers yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-3.5">
              {model.causes.map((cause) => (
                <li key={cause.owner} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="type-body-sm truncate font-medium text-foreground">
                      {DELAY_OWNER_LABELS[cause.owner]}
                    </span>
                    <span className="type-body-sm shrink-0 tabular-nums text-muted-foreground">
                      {cause.count} &middot; {formatUsd(cause.cost)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-destructive"
                      style={{ width: `${Math.max(6, cause.share * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Which ──────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-5 p-7 lg:col-span-4">
          <p className="type-label text-muted-foreground">Costliest containers</p>

          {model.worst.length === 0 ? (
            <p className="type-body-sm text-muted-foreground">Nothing outstanding.</p>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {model.worst.map((row) => (
                <li key={row.shipmentId}>
                  <button
                    type="button"
                    onClick={() => onOpenShipment(row)}
                    className="flex w-full items-center gap-3 rounded-card-nested px-2 py-2 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="type-body-sm block truncate text-foreground">
                        {row.containerNo ?? row.reference}
                      </span>
                      <span className="type-body-xs mt-0.5 block truncate text-muted-foreground">
                        {row.emptyReturnOverdueDays}d over &middot; {row.destination}
                      </span>
                    </span>
                    <span className="type-body-sm shrink-0 font-semibold tabular-nums text-destructive">
                      {formatUsd(row.detentionDays * DETENTION_RATE_PER_CONTAINER_DAY)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  intent,
}: {
  label: string;
  value: string;
  intent: 'bad' | 'warn' | 'neutral';
}) {
  return (
    <div className="rounded-card-nested bg-surface-sunken px-3 py-2.5">
      <dt className="type-body-xs truncate text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'type-h3 mt-0.5 tabular-nums',
          intent === 'bad' && 'text-destructive',
          intent === 'warn' && 'text-accent-subtle-foreground',
          intent === 'neutral' && 'text-foreground',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Derivation
 * ------------------------------------------------------------------------ */

interface Cause {
  owner: DelayOwner;
  count: number;
  cost: number;
  /** Of the largest cause, so the leader's bar is always full. */
  share: number;
}

interface EmptyReturnModel {
  overdue: ShipperShipmentRow[];
  dueSoon: ShipperShipmentRow[];
  worst: ShipperShipmentRow[];
  detentionDays: number;
  detentionCost: number;
  worstOverrunDays: number;
  avgCycleDays: number;
  causes: Cause[];
}

/** A container is still out until it is returned — delivery is not the end. */
function isOut(row: ShipperShipmentRow): boolean {
  return Boolean(row.containerNo) && !row.returnedAt;
}

function buildModel(rows: ShipperShipmentRow[]): EmptyReturnModel {
  const out = rows.filter(isOut);
  const overdue = out.filter((row) => row.emptyReturnOverdueDays > 0);
  const dueSoon = out.filter(
    (row) =>
      row.emptyReturnOverdueDays <= 0 &&
      row.freeTimeHoursRemaining !== undefined &&
      row.freeTimeHoursRemaining <= 48,
  );

  const detentionDays = Math.round(
    overdue.reduce((total, row) => total + row.detentionDays, 0),
  );

  const cycles = rows
    .filter((row) => row.returnedAt)
    .map((row) => row.emptyReturnOverdueDays)
    .filter((days) => Number.isFinite(days));

  // Cause is attributed per container, weighted by what that container costs —
  // ranking by headcount alone puts eight cheap one-day slips above the single
  // box that has been sitting for three weeks.
  const byOwner = new Map<DelayOwner, { count: number; cost: number }>();
  for (const row of overdue) {
    const owner = row.primaryDelayOwner;
    if (!owner) continue;
    const entry = byOwner.get(owner) ?? { count: 0, cost: 0 };
    entry.count += 1;
    entry.cost += row.detentionDays * DETENTION_RATE_PER_CONTAINER_DAY;
    byOwner.set(owner, entry);
  }

  const ranked = [...byOwner.entries()]
    .map(([owner, entry]) => ({ owner, ...entry }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 4);

  const topCost = ranked[0]?.cost ?? 1;

  return {
    overdue,
    dueSoon,
    worst: [...overdue]
      .sort((a, b) => b.detentionDays - a.detentionDays)
      .slice(0, 4),
    detentionDays,
    detentionCost: detentionDays * DETENTION_RATE_PER_CONTAINER_DAY,
    worstOverrunDays: Math.round(
      overdue.reduce((max, row) => Math.max(max, row.emptyReturnOverdueDays), 0),
    ),
    avgCycleDays:
      cycles.length === 0 ? 0 : cycles.reduce((total, days) => total + days, 0) / cycles.length,
    causes: ranked.map((entry) => ({ ...entry, share: entry.cost / (topCost || 1) })),
  };
}

function formatUsd(amount: number): string {
  return `$${Math.round(amount).toLocaleString()}`;
}
