import { useEffect } from 'react';
import confetti from 'canvas-confetti';

import { Dialog, DialogContent } from '@/design-system';
import { Button } from '@/design-system';
import { ArrowLeftRight, ArrowRight, Handshake } from '@/design-system/icons';
import { tokenColor } from '@/utils';

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

/**
 * Two side cannons, fired the moment the pairing lands.
 *
 * Thrown on the window rather than inside the dialog: a celebration confined
 * to a 480px box reads as a loading state. A few particles a frame from each
 * edge for three seconds — a steady arc across the screen rather than one
 * explosion, so it is still going when the operator finishes reading the
 * number and gone by the time they reach for the button.
 *
 * `zIndex` is the one thing added to the recipe. The dialog sits at 600 and
 * the toast at 800 on the app's ordered scale, so at the library's default the
 * confetti would fly behind both and never be seen. The canvas takes no clicks
 * either way.
 */
const CANNON_MS = 3_000;

/**
 * The module's own four colours, read from the tokens at run time.
 *
 * The recipe's stock pink-and-peach belonged to no product and read as
 * borrowed on a page whose entire colour system is gold and teal. These are
 * the exact hues the thing being celebrated already wears: the gold of an
 * empty container, the teal of a full one, and the violet a pairing wears —
 * the same violet on the handshake above. Confetti in the palette of the two
 * boxes it is thrown for.
 *
 * Resolved at run time rather than pasted as hex so it follows the theme and
 * stays out of `check:ds`'s hex-literal count. Fallbacks are the light-theme
 * values, used only if a token ever goes missing.
 */
const CANNON_TOKENS: [string, string][] = [
  ['--container-empty', '#f9ac17'],
  ['--primary', '#60969d'],
  ['--container-full', '#436e74'],
  ['--stage-paired', '#836ae7'],
];

function useSideCannons(open: boolean) {
  useEffect(() => {
    if (!open) return;

    const endsAt = Date.now() + CANNON_MS;
    let frameId = 0;

    const shot = {
      /* Bigger than the stock recipe on all three axes that read as "size":
         twice the particles per frame, half again the paper, and enough
         velocity to carry them past the dialog instead of dying beside it.
         At 2 particles of `scalar` 1 they were a thin dribble at the edges of
         a 1600px page — the recipe is written for a demo card, not a screen. */
      particleCount: 4,
      spread: 70,
      startVelocity: 70,
      scalar: 1.5,
      colors: CANNON_TOKENS.map(([token, fallback]) => tokenColor(token, fallback)),
      /* Above the dialog it celebrates and the toast beside it — the app's
         single ordered z-scale, which a canvas cannot read from CSS. */
      zIndex: 900,
      disableForReducedMotion: true,
    };

    const frame = () => {
      if (Date.now() > endsAt) return;
      void confetti({ ...shot, angle: 60, origin: { x: 0, y: 0.5 } });
      void confetti({ ...shot, angle: 120, origin: { x: 1, y: 0.5 } });
      frameId = requestAnimationFrame(frame);
    };
    frame();

    /* Closing the dialog has to take the sky with it. Without this, an operator
       who dismisses at 300ms watches confetti rain over the pile they are
       trying to work, and the loop outlives the component. */
    return () => {
      cancelAnimationFrame(frameId);
      confetti.reset();
    };
  }, [open]);
}

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
  useSideCannons(open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" hideCloseButton aria-describedby={undefined} className="overflow-hidden">
        <div className="relative flex flex-col items-center gap-4 px-6 pb-6 pt-8 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-full bg-stage-paired text-stage-paired-foreground shadow-card">
            <Handshake className="size-7" aria-hidden />
          </span>

          <div className="space-y-1">
            <p className="type-label text-stage-paired-subtle-foreground">Pairing confirmed</p>
            {/* The outcome, not the mechanism — and not praise. The operator did
                their job; this reports what the job was worth. */}
            <h2 className="text-xl font-extrabold tracking-tight text-foreground">
              One empty return avoided
            </h2>
            {/* The detention figure that used to sit here was an ASSUMPTION —
                `AVOIDED_TRIP_DETENTION_DAYS` (2) × the rate from Settings — and
                `performance.ts` says so itself: nobody can know what a
                container would have cost had it gone back on its own. The
                Performance screen prints it as "Est." with the assumption
                underneath, which is honest. Here it was a flat sentence with
                neither, and a guess stated as a fact is worse than no figure.
                The headline above is the part that is actually measured. */}
            <p className="text-sm text-muted-foreground">
              One truck that will not drive back empty.
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
