import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/design-system';
import { ExternalLink, Layers, MapPin, X } from '@/design-system/icons';
import { ROUTES } from '@/config/routes';
import { riskOf, slackOf, useEmptyReturnStore } from '@/stores/emptyReturn.store';
import type { EmptyReturnRecord } from '@/types/emptyReturn';

import { CycleRowDetail } from './CycleRowDetail';
import { Mono } from './atoms';
import { DeadlineCell, UrgencyBadge } from './ui';

const ROUTE_REGISTRY: Readonly<Record<string, string>> = ROUTES;
const MATCHING_ROUTE = ROUTE_REGISTRY['emptyReturnsMatching'] ?? '/empty-returns/matching';

export interface CycleDetailModalProps {
  /** The cycle being inspected, or null when nothing is open. */
  record: EmptyReturnRecord | null;
  /** The list's live clock, so modal and row agree on slack. */
  now: number;
  onClose: () => void;
}

/**
 * Cycle detail as a dialog rather than an inline accordion.
 *
 * The board is a scanning surface: expanding a row in place pushed every other
 * cycle off screen just when Operations wanted to compare them. The detail now
 * opens over the list, so the row order underneath never moves.
 *
 * Identity (reference, chain, hub, urgency, deadline) lives in the dialog
 * header — `CycleRowDetail` renders only the two working columns.
 */
export function CycleDetailModal({ record, now, onClose }: CycleDetailModalProps) {
  const navigate = useNavigate();
  const setMatchSelection = useEmptyReturnStore((state) => state.setMatchSelection);
  const panelRef = useRef<HTMLDivElement>(null);

  const open = record !== null;

  // Held in a ref so the effect below keys off `open` alone. The page re-renders
  // every clock tick with a fresh `onClose` closure; re-running the effect on
  // that would re-focus the panel mid-typing in the Empty-Ready time field.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Escape closes, and the page behind must not scroll while the dialog is up.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
      }
    };

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!record) return null;

  const reference = record.cycleId ?? record.id;
  const risk = riskOf(record, now);
  const slack = slackOf(record, now);
  const alerts = record.exception ? [record.exception] : [];
  const titleId = `cycle-detail-title-${record.id}`;
  const panelId = `cycle-detail-panel-${record.id}`;

  return createPortal(
    <div
      className="fixed inset-0 z-overlay flex items-start justify-center overflow-y-auto bg-overlay/60 p-3 backdrop-blur-[2px] animate-fade-in sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[min(94vh,900px)] w-full max-w-[1120px] flex-col overflow-hidden rounded-card border border-border bg-background shadow-lg outline-none animate-zoom-in"
      >
        {/* Identity band — everything the row showed, so nothing is lost on open */}
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 sm:px-5">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <span
              id={titleId}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary"
            >
              <Layers className="size-3.5" aria-hidden />
              <Mono>{reference}</Mono>
            </span>

            {record.chainId && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <span>Chain:</span>
                <Mono className="font-semibold text-foreground">{record.chainId}</Mono>
                <span className="text-muted-foreground/60">•</span>
                <span>Leg {record.seq}</span>
              </span>
            )}

            <span className="hidden min-w-0 items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
              <MapPin className="size-3 shrink-0 text-muted-foreground/80" aria-hidden />
              <span className="truncate font-medium text-foreground">{record.locationName}</span>
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <UrgencyBadge risk={risk} alerts={alerts} />
            <DeadlineCell deadline={record.deadline} slack={slack} risk={risk} />

            {record.status === 'empty_ready' && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  setMatchSelection(record.id);
                  onClose();
                  navigate(MATCHING_ROUTE);
                }}
              >
                <ExternalLink className="size-3" aria-hidden />
                Matching Console
              </Button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label={`Close ${reference} details`}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/10 p-4 sm:p-5">
          <CycleRowDetail record={record} now={now} panelId={panelId} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default CycleDetailModal;
