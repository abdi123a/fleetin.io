import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Card, IconChip, Input, Tooltip } from '@/design-system';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Copy,
  FileText,
  MapPin,
  Truck,
} from '@/design-system/icons';
import { companyInitials, EMPTY_RETURN_HUB, RETURN_MILESTONE } from '@/data/emptyReturnData';
import { ROUTES } from '@/config/routes';
import { formatDateTime, riskOf, useEmptyReturnStore } from '@/stores/emptyReturn.store';
import type { EmptyReturnRecord } from '@/types/emptyReturn';
import { cn } from '@/utils';

import { orgTintClass } from './ui/urgencyTokens';
import {
  DeadlineStatusLabel,
  FULL_LOAD_PLACEHOLDER,
  Mono,
} from './atoms';

/**
 * Five plain-language stages, replacing the old 16-step granular tracker.
 * The underlying `record.milestone` (0..16) still drives risk/status
 * elsewhere in the app untouched — this only buckets it for display.
 */
const SIMPLE_MILESTONE_STAGES = [
  'Previous full load delivered',
  'Unloading started',
  'Empty ready',
  'Full load mission selected',
  'Returned',
] as const;

/** Which of the 5 stages is "current" for a given granular milestone index. */
function simpleStageIndex(milestone: number): number {
  return Math.min(milestone, SIMPLE_MILESTONE_STAGES.length - 1);
}

/** Stage `i` is done — unlike the first four, "Returned" only completes once
 *  the box is physically back (`RETURN_MILESTONE`), not the moment its bucket starts. */
function simpleStageDone(index: number, milestone: number): boolean {
  if (index < SIMPLE_MILESTONE_STAGES.length - 1) return milestone > index;
  return milestone >= RETURN_MILESTONE;
}

const ROUTE_REGISTRY: Readonly<Record<string, string>> = ROUTES;
const MATCHING_ROUTE = ROUTE_REGISTRY['emptyReturnsMatching'] ?? '/empty-returns/matching';

export interface CycleRowDetailProps {
  record: EmptyReturnRecord;
  /** The list's live clock, passed down so the row and its detail agree. */
  now: number;
  /** Id for the panel body — the dialog points its `aria-controls` at it. */
  panelId: string;
}

/** `<input type="datetime-local">` wants local time with no timezone suffix. */
function toDateTimeLocalValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CycleRowDetail({ record, now, panelId }: CycleRowDetailProps) {
  const navigate = useNavigate();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showEmptyReadyPrompt, setShowEmptyReadyPrompt] = useState(false);
  const [emptyReadyTimeInput, setEmptyReadyTimeInput] = useState('');

  const confirmCycle = useEmptyReturnStore((state) => state.confirmCycle);
  const dispatchTruck = useEmptyReturnStore((state) => state.dispatchTruck);
  const advanceMilestone = useEmptyReturnStore((state) => state.advanceMilestone);
  const markEmptyReady = useEmptyReturnStore((state) => state.markEmptyReady);
  const markStandaloneRequired = useEmptyReturnStore((state) => state.markStandaloneRequired);
  const setMatchSelection = useEmptyReturnStore((state) => state.setMatchSelection);

  const timelineRef = useRef<HTMLOListElement>(null);
  const currentStepRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const list = timelineRef.current;
    const step = currentStepRef.current;
    if (!list || !step) return;
    list.scrollTop = Math.max(0, step.offsetTop - list.clientHeight / 2);
  }, [record.milestone]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const openEmptyReadyPrompt = () => {
    setEmptyReadyTimeInput(toDateTimeLocalValue(now));
    setShowEmptyReadyPrompt(true);
  };

  const confirmEmptyReady = () => {
    const ms = emptyReadyTimeInput ? new Date(emptyReadyTimeInput).getTime() : NaN;
    markEmptyReady(record.id, Number.isFinite(ms) ? ms : undefined);
    setShowEmptyReadyPrompt(false);
  };

  const risk = riskOf(record, now);
  const currentStage = simpleStageIndex(record.milestone);
  const showCutoffNote =
    (risk === 'critical' || risk === 'at_risk' || risk === 'overdue') &&
    record.status !== 'completed';
  const showEmptyReadyActions = record.status === 'empty_ready' && !record.exception;

  return (
    <div id={panelId} className="space-y-3">
      {/* 2-Column Structured Layout */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── Column 1: Operational Milestones (5 simple stages) ── */}
        <Card className="flex flex-col border border-border/80 bg-card p-4 shadow-2xs">
          <div className="mb-3 flex items-center justify-between border-b border-border/60 pb-2.5">
            <div className="flex items-center gap-2">
              <IconChip icon={Clock} size={36} />
              <h4 className="text-xs font-bold text-foreground">Operational Milestones</h4>
            </div>
            <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-semibold text-foreground">
              {currentStage + 1}/{SIMPLE_MILESTONE_STAGES.length}
            </span>
          </div>

          <ol
            ref={timelineRef}
            className="relative flex-1 space-y-2 overflow-y-auto pr-1 max-h-[310px]"
          >
            {SIMPLE_MILESTONE_STAGES.map((label, index) => {
              const complete = simpleStageDone(index, record.milestone);
              const current = index === currentStage && !complete;

              return (
                <li
                  key={label}
                  ref={current ? currentStepRef : undefined}
                  aria-current={current ? 'step' : undefined}
                  className={cn(
                    'group relative flex items-start gap-2.5 rounded-md p-1.5 transition-colors text-xs',
                    current && 'bg-primary/5 font-semibold text-primary ring-1 ring-primary/20',
                    complete && 'text-foreground/90',
                    !complete && !current && 'text-muted-foreground/70',
                  )}
                >
                  <div className="relative mt-0.5 flex size-4 shrink-0 items-center justify-center">
                    {complete ? (
                      <CheckCircle2 className="size-4 text-success-subtle-foreground" aria-hidden />
                    ) : current ? (
                      <span className="relative flex size-3">
                        <span className="absolute inline-flex h-full w-full animate-ping motion-reduce:animate-none rounded-full bg-primary opacity-75" />
                        <span className="relative inline-flex size-3 rounded-full bg-primary" />
                      </span>
                    ) : (
                      <Circle className="size-3.5 text-border-strong" aria-hidden />
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 items-baseline justify-between gap-1">
                    <span className="truncate">{label}</span>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/60">
                      #{index + 1}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>

          {record.status === 'preparing' && (
            <Button
              size="sm"
              fullWidth
              className="mt-3 bg-success text-white font-semibold shadow-xs hover:bg-success"
              leadingIcon={<Check className="size-3.5" />}
              onClick={() => confirmCycle(record.id)}
            >
              Confirm Cycle → Ready to Dispatch
            </Button>
          )}

          {record.status === 'ready' && (
            <Button
              size="sm"
              fullWidth
              className="mt-3 text-xs font-semibold shadow-xs"
              leadingIcon={<Truck className="size-3.5" />}
              onClick={() => dispatchTruck(record.id)}
            >
              Dispatch the Truck
            </Button>
          )}

          {record.status === 'in_progress' && (
            <Button
              size="sm"
              fullWidth
              className="mt-3 text-xs font-semibold shadow-xs"
              leadingIcon={<ArrowRight className="size-3.5" />}
              onClick={() => advanceMilestone(record.id)}
            >
              Advance Cycle
            </Button>
          )}
        </Card>

        {/* ── Column 2: Cycle Specifications & Documents ── */}
        <Card className="flex flex-col border border-border/80 bg-card p-4 shadow-2xs">
          <div className="mb-3 flex items-center justify-between border-b border-border/60 pb-2.5">
            <div className="flex items-center gap-2">
              <IconChip icon={FileText} tint="blue" size={36} />
              <div>
                <h4 className="text-xs font-bold text-foreground">Specifications &amp; Logistics</h4>
                <p className="text-[10px] text-muted-foreground">Hub, transporter, and timing</p>
              </div>
            </div>
            <DeadlineStatusLabel state={record.deadlineStatus} />
          </div>

          <dl className="flex-1 space-y-2 overflow-y-auto text-xs pr-1">
            {/* Empty Container */}
            <div className="flex items-center justify-between rounded-md border border-border/50 bg-muted/20 p-2">
              <div>
                <dt className="text-[11px] text-muted-foreground">Empty Container</dt>
                <dd className="font-semibold text-foreground">
                  <Mono>{record.container}</Mono>
                </dd>
                <p className="text-[10px] text-muted-foreground">
                  {record.type} • {record.line}
                </p>
              </div>
              <Tooltip content={copiedKey === 'empty' ? 'Copied!' : 'Copy container ID'}>
                <button
                  type="button"
                  onClick={() => handleCopy(record.container, 'empty')}
                  className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Copy className="size-3.5" />
                </button>
              </Tooltip>
            </div>

            {/* Next Full Load */}
            <div className="flex items-center justify-between rounded-md border border-border/50 bg-muted/20 p-2">
              <div>
                <dt className="text-[11px] text-muted-foreground">Next Full Outbound</dt>
                <dd className="font-semibold text-foreground">
                  {record.nextFull ? (
                    <Mono>{record.nextFull.container}</Mono>
                  ) : (
                    <span className="italic text-muted-foreground">{FULL_LOAD_PLACEHOLDER}</span>
                  )}
                </dd>
                {record.nextFull && (
                  <p className="text-[10px] text-muted-foreground">{record.nextFull.type}</p>
                )}
              </div>
              {record.nextFull && (
                <Tooltip content={copiedKey === 'full' ? 'Copied!' : 'Copy outbound ID'}>
                  <button
                    type="button"
                    onClick={() => record.nextFull && handleCopy(record.nextFull.container, 'full')}
                    className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Copy className="size-3.5" />
                  </button>
                </Tooltip>
              )}
            </div>

            {/* Shipper */}
            <div className="rounded-md border border-border/50 bg-muted/20 p-2">
              <dt className="text-[11px] text-muted-foreground">Shipper</dt>
              <dd className="mt-0.5 flex items-center gap-1.5 font-medium text-foreground">
                <span
                  aria-hidden
                  className={cn(
                    'inline-flex size-5 shrink-0 items-center justify-center rounded-sm font-mono text-[10px] font-bold shadow-2xs',
                    orgTintClass(record.client),
                  )}
                >
                  {companyInitials(record.client)}
                </span>
                <span className="truncate">{record.client}</span>
              </dd>
            </div>

            {/* Transporter & Truck */}
            <div className="rounded-md border border-border/50 bg-muted/20 p-2">
              <dt className="text-[11px] text-muted-foreground">Transporter &amp; Truck</dt>
              <dd className="mt-0.5 flex items-center justify-between font-medium text-foreground">
                <span className="truncate">{record.transporter}</span>
                <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                  {record.truck ?? 'Unassigned'}
                </span>
              </dd>
            </div>

            {/* Timestamps */}
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-md border border-border/50 bg-muted/20 p-2">
                <span className="text-muted-foreground">Empty Ready</span>
                <p className="font-semibold text-foreground">
                  <Mono>{formatDateTime(record.emptyReadyAt)}</Mono>
                </p>
              </div>

              {/* The return commitment captured on the booking — not a
                  prediction. Comes from Create Shipment's "Return Date & Time",
                  which lands on the record as `deadline`. */}
              <div className="rounded-md border border-border/50 bg-muted/20 p-2">
                <span className="text-muted-foreground">Container Return Date</span>
                <p className="font-semibold text-foreground">
                  {record.deadline ? (
                    <Mono>{formatDateTime(record.deadline)}</Mono>
                  ) : (
                    <span className="italic text-muted-foreground">Not set on booking</span>
                  )}
                </p>
              </div>
            </div>

            {/* Hub info */}
            <div className="rounded-md border border-border/50 bg-muted/20 p-2 text-[11px]">
              <span className="text-muted-foreground">Return &amp; Pickup Hub</span>
              <p className="font-medium text-foreground flex items-center gap-1 mt-0.5">
                <MapPin className="size-3 shrink-0 text-primary" />
                <span className="truncate">{EMPTY_RETURN_HUB}</span>
              </p>
            </div>
          </dl>

          {/* Actions Bottom Bar */}
          {(record.status === 'unloading' || showEmptyReadyActions || showCutoffNote) && (
            <div className="mt-3 flex flex-col gap-2 border-t border-border/60 pt-2.5">
              {record.status === 'unloading' && !showEmptyReadyPrompt && (
                <Button
                  size="sm"
                  fullWidth
                  className="text-xs font-semibold shadow-xs"
                  onClick={openEmptyReadyPrompt}
                >
                  <CheckCircle2 className="size-3.5 mr-1" />
                  Confirm &quot;Empty Ready&quot;
                </Button>
              )}

              {record.status === 'unloading' && showEmptyReadyPrompt && (
                <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-2.5">
                  <label className="block text-[10px] font-semibold text-muted-foreground">
                    When was the box actually empty? This is what unloading time gets measured against.
                  </label>
                  <Input
                    type="datetime-local"
                    value={emptyReadyTimeInput}
                    onChange={(e) => setEmptyReadyTimeInput(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      fullWidth
                      className="text-xs font-semibold shadow-xs"
                      onClick={confirmEmptyReady}
                    >
                      <CheckCircle2 className="size-3.5 mr-1" />
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs font-semibold"
                      onClick={() => setShowEmptyReadyPrompt(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {showEmptyReadyActions && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    fullWidth
                    className="text-xs font-semibold flex-1 shadow-xs"
                    onClick={() => {
                      setMatchSelection(record.id);
                      navigate(MATCHING_ROUTE);
                    }}
                  >
                    Open Matching
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-destructive/40 text-xs font-semibold text-destructive hover:bg-destructive/10"
                    onClick={() => markStandaloneRequired(record.id)}
                  >
                    Standalone Return
                  </Button>
                </div>
              )}

              {showCutoffNote && (
                <div className="flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning-subtle p-2 text-[11px] text-warning-subtle-foreground">
                  <AlertTriangle className="size-3.5 shrink-0 text-warning-subtle-foreground mt-0.5" />
                  <span>Safety cutoff near or passed: deadline protection takes precedence over matching.</span>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
