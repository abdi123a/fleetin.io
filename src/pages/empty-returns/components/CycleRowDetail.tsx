import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Card, IconChip, Tooltip } from '@/design-system';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  MapPin,
} from '@/design-system/icons';
import { buildPath, ROUTES } from '@/config/routes';
import { companyInitials, EMPTY_RETURN_HUB, EMPTY_RETURN_STATUS_META } from '@/data/emptyReturnData';
import { NEXT_BOOKING_STATUS } from '@/features/bookings/api/bookingsService';
import { useUpdateBookingStatus } from '@/features/bookings/api/queries';
import { useMarkStandalone } from '@/features/empty-returns/api/queries';
import { formatDateTime } from '@/stores/emptyReturn.store';
import type { EmptyReturnRecord, EmptyReturnStatus } from '@/types/emptyReturn';
import { cn } from '@/utils';

import { orgTintClass } from './ui/urgencyTokens';
import {
  DeadlineStatusLabel,
  FULL_LOAD_PLACEHOLDER,
  Mono,
} from './atoms';

/**
 * The post-match ladder: `preparing → ready → in_progress → completed`.
 * A cycle never has a status of its own to advance — this mirrors
 * `nextBooking.status` via the backend's `syncCycleStatusForBooking`, so the
 * one button below moves the real outbound booking forward and the cycle's
 * badge reflects it on the next fetch.
 */
const CYCLE_LADDER: readonly EmptyReturnStatus[] = ['preparing', 'ready', 'in_progress', 'completed'];

/** A booking that will never move again — nothing to advance it to. */
const TERMINAL_BOOKING_STATUSES = ['Completed', 'Cancelled', 'Failed'];

export interface CycleRowDetailProps {
  record: EmptyReturnRecord;
  /** The list's live clock, passed down so the row and its detail agree. */
  now: number;
  /** Id for the panel body — the dialog points its `aria-controls` at it. */
  panelId: string;
  /** Opens the one matching workbench — DualTransactionsRecommendationsModal. */
  onOpenMatching: () => void;
}

/** Opens the booking's own shipment, deep-linked straight to this booking's preview card — never just the bare shipment. */
function ShipmentLink({ shipmentReference, bookingId }: { shipmentReference?: string; bookingId?: string }) {
  const navigate = useNavigate();
  if (!shipmentReference) return null;

  const href = `${buildPath(ROUTES.shipmentOverview, { id: shipmentReference })}${bookingId ? `?openBooking=${encodeURIComponent(bookingId)}` : ''}`;

  return (
    <button
      type="button"
      onClick={() => navigate(href)}
      className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
    >
      <ExternalLink className="size-2.5 shrink-0" aria-hidden />
      <span className="truncate">Shipment {shipmentReference}</span>
    </button>
  );
}

export function CycleRowDetail({ record, panelId, onOpenMatching }: CycleRowDetailProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const updateBookingStatus = useUpdateBookingStatus();
  const markStandalone = useMarkStandalone();

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const isMatched = Boolean(record.cycleId);
  const currentStageIndex = CYCLE_LADDER.indexOf(record.status);
  /**
   * The next legal step for the **outbound full load** — the truck bringing a
   * container in and taking this empty back out. A cycle has no status of its
   * own, so this is the only thing there is to advance.
   *
   * Read off that booking's real position on the real ladder rather than a map
   * of its own: a hardcoded `ready → En Route` skipped the whole pickup leg
   * (Heading to Pickup, At Pickup, Loading, Loaded) and the backend rejected
   * it, and it kept offering to advance outbound loads that had already been
   * cancelled.
   */
  const outboundStatus = record.nextFull?.status;
  const proposed =
    outboundStatus && !TERMINAL_BOOKING_STATUSES.includes(outboundStatus)
      ? NEXT_BOOKING_STATUS[outboundStatus]
      : undefined;
  /* "Completed" is never offered as a click. A containerized load closes on its
   * own empty coming back, not on somebody pressing a button — the backend
   * refuses it either way — so the last manual rung is POD Submitted and the
   * system takes it from there. */
  const nextBookingStatus = proposed === 'Completed' ? undefined : proposed;
  const nextBookingId = record.nextFull?.missionId;
  const showEmptyReadyActions = record.status === 'empty_ready' && !record.exception;
  const showCutoffNote = record.exception != null && record.status !== 'completed';

  return (
    <div id={panelId} className="space-y-3">
      {/* 2-Column Structured Layout */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── Column 1: Cycle progress ── */}
        <Card className="flex flex-col border border-border/80 bg-card p-4 shadow-2xs">
          <div className="mb-3 flex items-center justify-between border-b border-border/60 pb-2.5">
            <div className="flex items-center gap-2">
              <IconChip icon={Clock} size={36} />
              <h4 className="text-xs font-bold text-foreground">Cycle Progress</h4>
            </div>
            {isMatched && (
              <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-semibold text-foreground">
                {Math.max(currentStageIndex, 0) + 1}/{CYCLE_LADDER.length}
              </span>
            )}
          </div>

          {isMatched ? (
            <>
              <ol className="flex-1 space-y-2">
                {CYCLE_LADDER.map((status, index) => {
                  const complete = currentStageIndex > index;
                  const current = index === currentStageIndex;
                  const meta = EMPTY_RETURN_STATUS_META[status];

                  return (
                    <li
                      key={status}
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
                      <span className="truncate">{meta.label}</span>
                    </li>
                  );
                })}
              </ol>

              {nextBookingStatus && nextBookingId && (
                <div className="mt-3 space-y-1.5">
                  <Button
                    size="sm"
                    fullWidth
                    className="text-xs font-semibold shadow-xs"
                    leadingIcon={<ArrowRight className="size-3.5" />}
                    isLoading={updateBookingStatus.isPending}
                    onClick={() => updateBookingStatus.mutate({ id: nextBookingId, status: nextBookingStatus })}
                  >
                    Move outbound load to {nextBookingStatus}
                  </Button>
                  {/* A cycle has no status of its own, so the button had no
                      subject and read as "advance… something". Naming the
                      truck it moves is the whole explanation. */}
                  <p className="type-body-xs text-center text-muted-foreground">
                    Moves {record.nextFull?.missionId ?? 'the outbound load'} — the truck carrying
                    this empty back. The cycle follows it.
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="type-body-sm flex-1 text-muted-foreground">
              Not matched yet — this container is ready to go back but has no outbound load assigned.
              Open Matching to weld it to one.
            </p>
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
                <ShipmentLink shipmentReference={record.shipmentReference} bookingId={record.bookingId} />
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
                {record.nextFull && (
                  <ShipmentLink
                    shipmentReference={record.nextFull.shipmentReference}
                    bookingId={record.nextFull.bookingId}
                  />
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
                  prediction. Comes from Create Shipment's "Return Date & Time". */}
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
          {(showEmptyReadyActions || showCutoffNote) && (
            <div className="mt-3 flex flex-col gap-2 border-t border-border/60 pt-2.5">
              {showEmptyReadyActions && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    fullWidth
                    className="text-xs font-semibold flex-1 shadow-xs"
                    onClick={onOpenMatching}
                  >
                    Open Matching
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-destructive/40 text-xs font-semibold text-destructive hover:bg-destructive/10"
                    isLoading={markStandalone.isPending}
                    onClick={() => markStandalone.mutate(record.id)}
                  >
                    Standalone Return
                  </Button>
                </div>
              )}

              {showCutoffNote && (
                <div className="flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning-subtle p-2 text-[11px] text-warning-subtle-foreground">
                  <AlertTriangle className="size-3.5 shrink-0 text-warning-subtle-foreground mt-0.5" />
                  <span>{record.exception}</span>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
