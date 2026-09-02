import { Dialog, DialogContent } from '@/design-system';
import { Button } from '@/design-system';
import { ArrowLeftRight, ArrowRight, Handshake } from '@/design-system/icons';
import { AVOIDED_TRIP_DETENTION_DAYS } from '@/features/empty-returns';
import { detentionRatePerDay, formatDetention } from '@/data/emptyReturnData';
import { cn } from '@/utils';

import { EmptyTag, Mono } from './marks';

/**
 * The moment a pairing is confirmed.
 *
 * This is the only point in the product where the operator has *prevented* a
 * cost rather than recorded one: an empty container is going home under
 * somebody else's load instead of on a truck of its own. It used to be
 * acknowledged by a thin green strip above the workbench — the same weight the
 * app gives a saved filter — and the user's note was that nothing about it felt
 * like anything had happened.
 *
 * So it interrupts. A burst, the two boxes welded together, and the number the
 * business actually banks. Then one button, and the operator is back at the
 * pile with the next container already selected.
 *
 * ## What keeps it professional rather than childish
 *
 * It states a fact and it states it once. The headline is the *outcome* — one
 * empty return avoided — not "Nice work!", because the operator did their job
 * and the system is reporting the result, not praising them. The figure under
 * it is the real detention estimate, the same arithmetic the Cycles page uses,
 * so this is a receipt rather than a sticker.
 *
 * Nothing loops. Every animation runs once and stops, and all of it is behind
 * `motion-reduce` — a celebration that keeps moving is a thing to dismiss, and
 * this has to be gone before the next decision.
 */

/** Chips thrown from the centre. Fixed, not random: a re-render must not reshuffle them. */
const CHIPS: { x: string; y: string; spin: string; delay: string; tone: string; size: string }[] = [
  { x: '-120px', y: '-84px', spin: '-220deg', delay: '0ms', tone: 'bg-container-empty', size: 'h-2.5 w-1.5' },
  { x: '118px', y: '-96px', spin: '200deg', delay: '40ms', tone: 'bg-container-full', size: 'h-2 w-2' },
  { x: '-168px', y: '18px', spin: '160deg', delay: '80ms', tone: 'bg-stage-paired', size: 'h-1.5 w-1.5' },
  { x: '162px', y: '34px', spin: '-180deg', delay: '20ms', tone: 'bg-container-empty', size: 'h-2 w-1.5' },
  { x: '-72px', y: '112px', spin: '240deg', delay: '110ms', tone: 'bg-container-full', size: 'h-1.5 w-2' },
  { x: '86px', y: '120px', spin: '-140deg', delay: '70ms', tone: 'bg-stage-paired', size: 'h-2.5 w-1.5' },
  { x: '-30px', y: '-140px', spin: '190deg', delay: '130ms', tone: 'bg-container-empty', size: 'h-2 w-2' },
  { x: '44px', y: '-132px', spin: '-210deg', delay: '10ms', tone: 'bg-container-full', size: 'h-1.5 w-1.5' },
];

export interface PairingCelebrationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The empty that no longer needs its own trip. */
  empty: string;
  /** The full load it goes out under, and that load's shipment. */
  full: string;
  load: string;
  /** Rendered as the way back when the operator arrived from a shipment. */
  backTo?: string | null;
  onBack?: () => void;
}

export function PairingCelebration({
  open,
  onOpenChange,
  empty,
  full,
  load,
  backTo,
  onBack,
}: PairingCelebrationProps) {
  /* The same arithmetic the Cycles page banks — two container-days at the
     current rate, per return avoided. Not a made-up figure for the occasion. */
  const saved = formatDetention(AVOIDED_TRIP_DETENTION_DAYS * detentionRatePerDay());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" hideCloseButton aria-describedby={undefined} className="overflow-hidden">
        {/* The burst sits behind everything and catches no clicks. */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
          {[0, 1, 2].map((ring) => (
            <span
              key={ring}
              style={{ animationDelay: `${ring * 140}ms` }}
              className="col-start-1 row-start-1 size-28 rounded-full border-2 border-stage-paired-border animate-burst-ring motion-reduce:animate-none motion-reduce:opacity-0"
            />
          ))}
          {CHIPS.map((chip) => (
            <span
              /* The throw is the identity — the list is static and never reorders. */
              key={`${chip.x}${chip.y}`}
              style={
                {
                  '--fl-throw-x': chip.x,
                  '--fl-throw-y': chip.y,
                  '--fl-throw-spin': chip.spin,
                  animationDelay: chip.delay,
                } as React.CSSProperties
              }
              className={cn(
                'col-start-1 row-start-1 rounded-sm animate-burst-chip motion-reduce:animate-none motion-reduce:opacity-0',
                chip.size,
                chip.tone,
              )}
            />
          ))}
        </div>

        <div className="relative flex flex-col items-center gap-4 px-6 pb-6 pt-8 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-full bg-stage-paired text-stage-paired-foreground shadow-card animate-burst-pop motion-reduce:animate-none">
            <Handshake className="size-7" aria-hidden />
          </span>

          <div className="space-y-1">
            <p className="type-label text-stage-paired-subtle-foreground">Pairing confirmed</p>
            {/* The outcome, not the mechanism — and not praise. The operator did
                their job; this reports what the job was worth. */}
            <h2 className="text-xl font-extrabold tracking-tight text-foreground">
              One empty return avoided
            </h2>
            <p className="text-sm text-muted-foreground">
              About <span className="font-bold text-foreground">{saved}</span> of detention that will
              not be spent, and one truck that will not drive back empty.
            </p>
          </div>

          {/* The two boxes, welded. `⇄` because these are two DIFFERENT
              containers — the module's legend reserves the thin arrow for one
              box changing state. */}
          <div className="flex w-full flex-wrap items-center justify-center gap-2 rounded-card border border-border bg-surface-sunken px-3 py-3">
            <span className="inline-flex items-center gap-1.5 rounded-md border-2 border-dashed border-container-empty-border bg-card px-2.5 py-1">
              <EmptyTag small />
              <Mono className="font-bold text-foreground">{empty}</Mono>
            </span>
            <ArrowLeftRight className="size-4 shrink-0 text-stage-paired-subtle-foreground" aria-hidden />
            <span className="inline-flex items-center gap-1.5 rounded-md bg-container-full px-2.5 py-1 text-container-full-foreground">
              <Mono className="font-bold">{full}</Mono>
              <span className="text-[10px] opacity-80">{load}</span>
            </span>
          </div>

          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-center">
            <Button variant="primary" size="sm" onClick={() => onOpenChange(false)} className="sm:min-w-32">
              Keep matching
            </Button>
            {backTo && onBack && (
              /* The moment the job is done is the moment somebody wants to
                 leave — so the way out is offered here, not only in a strip
                 they have to go looking for. */
              <Button variant="outline" size="sm" onClick={onBack} className="gap-1.5">
                Back to {backTo}
                <ArrowRight className="size-3.5" aria-hidden />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
