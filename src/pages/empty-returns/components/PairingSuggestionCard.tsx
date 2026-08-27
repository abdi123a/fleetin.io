import { useState } from 'react';

import { Badge, Button, Card, Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/design-system';
import { ArrowLeftRight, Info, MapPin, Package, PackageOpen, X } from '@/design-system/icons';
import { formatSpan, formatStamp } from '@/stores/emptyReturn.store';
import type { IncompatibleLoad, PairingSuggestion, SuggestionLabel } from '@/types/emptyReturn';
import { cn } from '@/utils';

import { Mono } from './marks';

/**
 * One pairing opportunity — the decision, not the dossier.
 *
 * An earlier version of this card printed everything the engine knew: a
 * two-column definition list, three compatibility ticks, and three reason
 * lines, on every card. Fourteen facts to make one yes/no call. The operator's
 * question is much narrower than that:
 *
 * > *Which box goes out under which load, when, and does it beat the deadline?*
 *
 * So the card answers exactly that, in one glance:
 *
 * ```
 *   ○ EMPTY MSKU7070707   ⇄   ● FULL CMAU8110034   ·   MSN-00172
 *   Collected 24/08 16:30 · 1d 16h of margin · same location
 * ```
 *
 * Everything else — the score's reasoning, the three checks — folds into
 * "Why this one?", which is closed by default. Nothing was removed; it stopped
 * being shouted.
 */

const LABEL_INTENT: Record<SuggestionLabel, 'primary' | 'default' | 'warning'> = {
  RECOMMENDED: 'primary',
  ALTERNATIVE: 'default',
  /* Amber, not red: a tight pairing is a real option somebody may have to take,
     and colouring it as a failure pushes them into a worse one. */
  'LAST OPTION': 'warning',
};

export interface PairingSuggestionCardProps {
  suggestion: PairingSuggestion;
  /** Highlighted frame and a filled primary action. Reserved for the first card. */
  featured?: boolean;
  actionLabel?: string;
  onConfirm: () => void;
  /** Omitted inside the dialog, where rejecting has nowhere to go. */
  onReject?: () => void;
  disabled?: boolean;
  className?: string;
}

export function PairingSuggestionCard({
  suggestion,
  featured = false,
  actionLabel = 'Confirm pairing',
  onConfirm,
  onReject,
  disabled = false,
  className,
}: PairingSuggestionCardProps) {
  const [showWhy, setShowWhy] = useState(false);
  const { record, load, marginMs, tight, score, label, reasons, sameLocation } = suggestion;

  return (
    <Card
      className={cn(
        'min-w-0 overflow-hidden rounded-lg border bg-card shadow-2xs transition duration-200',
        featured ? 'border-primary/50 ring-1 ring-primary/20' : 'border-border/80',
        className,
      )}
    >
      <div className="min-w-0 space-y-2.5 p-4">
        {/* Which shipment, and how strongly it is recommended */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge variant={featured ? 'solid' : 'subtle'} intent={LABEL_INTENT[label]} size="sm">
            {label}
          </Badge>
          <Mono className="truncate text-sm font-bold text-foreground">
            {load.shipmentReference ?? load.id}
          </Mono>
          <span className="shrink-0 text-xs text-muted-foreground">
            {load.line} · {load.size}
          </span>
          <Badge variant="subtle" intent="primary" size="sm" className="ml-auto shrink-0 font-bold">
            {score}%
          </Badge>
        </div>

        {/* The pairing itself — two containers, drawn */}
        <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-border/50 bg-secondary/40 px-3 py-2 text-xs">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <PackageOpen className="size-3.5 shrink-0 text-info" aria-hidden />
            <Mono className="truncate font-bold text-foreground">{record.container || '—'}</Mono>
          </span>
          <ArrowLeftRight className="size-3.5 shrink-0 text-primary" aria-hidden />
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Package className="size-3.5 shrink-0 text-primary" aria-hidden />
            <Mono className="truncate font-bold text-foreground">{load.container || '—'}</Mono>
          </span>
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
            two different containers
          </span>
        </div>

        {/* The three facts the decision turns on */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="shrink-0">
            Collected <Mono className="font-semibold text-foreground">{formatStamp(load.pickupAt)}</Mono>
          </span>
          <span aria-hidden>·</span>
          <span
            className={cn(
              'shrink-0 font-semibold',
              tight ? 'text-warning-subtle-foreground' : 'text-success-subtle-foreground',
            )}
          >
            {formatSpan(marginMs)} of margin{tight ? ' (tight)' : ''}
          </span>
          <span aria-hidden>·</span>
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin className="size-3 shrink-0" aria-hidden />
            <span className="truncate" title={load.pickupHub}>
              {sameLocation ? 'Same location' : load.pickupHub}
            </span>
          </span>
        </div>

        {/* Actions, and the reasoning folded behind one link */}
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
          <Collapsible open={showWhy} onOpenChange={setShowWhy}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-1.5 text-[11px] text-muted-foreground"
              >
                <Info className="size-3" /> Why this one?
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
                <li>· Same shipping line and container size</li>
                <li>· Collected before the return deadline</li>
                {reasons.map((reason) => (
                  <li key={reason}>· {reason}</li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>

          <div className="flex shrink-0 items-center gap-1.5">
            {onReject && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onReject}
                disabled={disabled}
                className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
              >
                <X className="size-3" /> Not this one
              </Button>
            )}
            <Button
              variant={featured ? 'primary' : 'outline'}
              size="sm"
              onClick={onConfirm}
              disabled={disabled}
              className="h-7 whitespace-nowrap rounded-lg px-3 text-xs"
            >
              {actionLabel}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export interface IncompatibleLoadListProps {
  loads: IncompatibleLoad[];
  className?: string;
}

/**
 * The loads that cannot take this container, with the reason on each.
 *
 * Behind a disclosure, but never absent: "no match found" with no reason is the
 * difference between a system an operator trusts and one they work around.
 */
export function IncompatibleLoadList({ loads, className }: IncompatibleLoadListProps) {
  if (loads.length === 0) return null;

  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      {loads.map(({ load, issues }) => (
        <div
          key={load.id}
          className="min-w-0 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
            <Package className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <Mono className="truncate font-bold text-foreground">
              {load.shipmentReference ?? load.id}
            </Mono>
            <span className="shrink-0 text-muted-foreground">
              {load.line} · {load.size}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{issues.join(' · ')}</div>
        </div>
      ))}
    </div>
  );
}
