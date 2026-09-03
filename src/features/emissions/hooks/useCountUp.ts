import { useEffect, useState } from 'react';

import { animationDuration } from '@/features/shipper-bi/charts/chartTheme';

/**
 * A number that counts up to its value when it first appears.
 *
 * Ease-out over roughly a second, so the figure lands rather than stops.
 * Under `prefers-reduced-motion` the duration is zero and the final value
 * is shown at once — the same helper the charts use, so the whole page
 * makes one decision about motion.
 *
 * The count re-runs when `to` changes (a filter, a re-judged book), which is
 * what makes a new figure read as new. `active` holds it at zero until the
 * caller says go, so a card can count after it has entered rather than
 * during.
 */
export function useCountUp(to: number, options: { durationMs?: number; delayMs?: number; active?: boolean } = {}) {
  const { durationMs = 1000, delayMs = 0, active = true } = options;
  const duration = animationDuration(durationMs);
  const [value, setValue] = useState(duration === 0 ? to : 0);
  const [done, setDone] = useState(duration === 0);

  useEffect(() => {
    if (!active) return;
    if (duration === 0 || !Number.isFinite(to)) {
      setValue(to);
      setDone(true);
      return;
    }
    let frame = 0;
    let start = 0;
    const from = 0;
    setDone(false);
    const timer = window.setTimeout(() => {
      const tick = (now: number) => {
        if (!start) start = now;
        const progress = Math.min(1, (now - start) / duration);
        /* Ease-out cubic: fast off the mark, gentle into place. */
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(from + (to - from) * eased);
        if (progress < 1) frame = requestAnimationFrame(tick);
        else setDone(true);
      };
      frame = requestAnimationFrame(tick);
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [to, duration, delayMs, active]);

  return { value, done };
}
