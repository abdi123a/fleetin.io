import type { CSSProperties, HTMLAttributes } from 'react';

import { cn } from '@/utils';

export interface ShineBorderProps extends HTMLAttributes<HTMLDivElement> {
  /** Thickness of the lit edge before it is blurred, in pixels. */
  borderWidth?: number;
  /** One full travel of the light around the edge, in seconds. */
  duration?: number;
  /** Seconds between one gloss pass and the next. */
  glossEvery?: number;
  /** The slow pass of light across the face. */
  gloss?: boolean;
  /** The colours the light is made of. Any CSS colour, `var(--token)` included. */
  shineColor?: string | string[];
}

const DEFAULT_COLORS = ['var(--return-matched)', 'var(--primary)', 'var(--accent)'];

/**
 * Put this on the HOST, beside `relative overflow-hidden`.
 *
 * The half of the effect that cannot live inside the overlay. A card that
 * clips its children can only ever bloom *inward*, and light that stops dead
 * at the edge it is supposed to be spilling from is exactly what makes an
 * overlay read as a drawn outline — the first two versions of this both did.
 * The spill has to be a `box-shadow` on the card itself, because a shadow is
 * the one thing `overflow: hidden` does not cut off.
 *
 * It breathes rather than sitting still, slowly and out of step with the rim's
 * travel, so the two never pulse together and land on a rhythm.
 */
export const SHINE_HOST =
  'animate-glow-breathe [--fl-glow-color:color-mix(in_srgb,var(--return-matched)_35%,transparent)] motion-reduce:animate-none';

/**
 * Light on a surface: a soft lit rim, a glow that spills, and a gloss that
 * passes over the face.
 *
 * ## Why it is built in layers
 *
 * Tuned DOWN three times, and the direction was the same every time: LESS
 * SPREAD. A lit card sits in a grid beside five unlit ones and only has to be
 * the one the eye reaches first — it never has to announce itself. What kept
 * reading as too much was not the brightness but the reach: a halo bleeding
 * ten pixels off every side is a second object around the card, and at three
 * up on a wide screen the two lit ones read as a coloured region rather than
 * as two cards. What is left is a lit EDGE with barely any bleed. If it is
 * ever adjusted again, move the blur radii and the shadow spreads, not the
 * colours.
 *
 * A single masked gradient ring — the whole of the first version — reads as a
 * *moving stroke*, because that is what it is: a hard-edged line a pixel and a
 * half wide, sliding. Light has no edge. What makes something look lit is
 * bloom: no crisp boundary anywhere, and a falloff that carries past the thing
 * emitting it.
 *
 * So there is no crisp ring here at all. Two blurred copies of the same
 * gradient sit on top of each other:
 *
 *  - `bloom` — very thick and heavily blurred, at low opacity. The soft body
 *    of the light, most of which falls inward across the card.
 *  - `filament` — thinner and lightly blurred, brighter. Enough to give the
 *    bloom a source, never enough to read as a line. Blurring it is the whole
 *    difference between "lit edge" and "coloured border".
 *
 * Over the face:
 *
 *  - `gloss` — a wide, blurred band of light that crosses and then waits. It
 *    is off-screen for three quarters of its cycle (see `fl-gloss`), so it
 *    arrives every few seconds as an event rather than being one more thing
 *    permanently in motion. Tinted at the flanks and near-white at the centre,
 *    because a purely white band on a white card is invisible — what you see
 *    pass is the colour either side of the highlight.
 *
 * And outside, on the host: `SHINE_HOST`. See its note.
 *
 * Everything here is `pointer-events-none` and absolutely positioned, so it
 * lies over a clickable card without ever being what gets clicked, and the
 * wrapper takes `rounded-[inherit]` so it follows the host's corner.
 *
 * Under `prefers-reduced-motion` nothing travels, no gloss passes and the
 * outer glow stops breathing: the card keeps a still, soft, lit edge. The
 * signal survives; only the movement goes.
 */
export function ShineBorder({
  borderWidth = 1,
  duration = 9,
  glossEvery = 6,
  gloss = true,
  shineColor = DEFAULT_COLORS,
  className,
  style,
  ...props
}: ShineBorderProps) {
  const colors = Array.isArray(shineColor) ? shineColor.join(', ') : shineColor;

  /** The masked ring, at whatever thickness the layer wants. */
  const ring = (width: number): CSSProperties =>
    ({
      padding: `${width}px`,
      backgroundImage: `radial-gradient(transparent, transparent, ${colors}, transparent, transparent)`,
      backgroundSize: '300% 300%',
      /* Both spellings: `mask-composite` is standard, the `-webkit-` pair is
         what Safari still reads, and the two take different keywords. */
      mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
      WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
      maskComposite: 'exclude',
      WebkitMaskComposite: 'xor',
      '--fl-shine-duration': `${duration}s`,
    }) as CSSProperties;

  return (
    <div
      aria-hidden
      style={style}
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]',
        className,
      )}
      {...props}
    >
      {/* The soft body of the light. */}
      <div
        style={ring(borderWidth * 3)}
        className="absolute inset-0 size-full rounded-[inherit] opacity-[0.15] blur-[5px] will-change-[background-position] animate-shine motion-reduce:animate-none"
      />
      {/* Its source — blurred too, or it is a line again. */}
      <div
        style={ring(borderWidth)}
        className="absolute inset-0 size-full rounded-[inherit] opacity-40 blur-[1.5px] will-change-[background-position] animate-shine motion-reduce:animate-none"
      />

      {gloss && (
        <div
          style={{ '--fl-gloss-duration': `${glossEvery}s` } as CSSProperties}
          className="absolute inset-y-0 -left-1/2 w-2/3 will-change-transform animate-gloss motion-reduce:hidden"
        >
          <div className="size-full blur-[8px] bg-[linear-gradient(100deg,transparent_0%,color-mix(in_srgb,var(--return-matched)_14%,transparent)_36%,color-mix(in_srgb,white_94%,var(--primary))_50%,color-mix(in_srgb,var(--accent)_14%,transparent)_64%,transparent_100%)]" />
        </div>
      )}
    </div>
  );
}
