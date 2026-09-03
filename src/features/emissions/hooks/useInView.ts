import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Has this element scrolled into view yet?
 *
 * Latches: once true, stays true. The bars and rows this drives animate
 * from nothing to their value the first time a reader reaches them, and a
 * second play on the way back up would be a page that keeps re-introducing
 * itself. Falls open (true) where `IntersectionObserver` is missing, so the
 * figures are never hidden by the animation that was meant to reveal them.
 */
export function useInView<T extends HTMLElement>(
  options: { rootMargin?: string; threshold?: number } = {},
): [RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  const { rootMargin = '0px 0px -10% 0px', threshold = 0.2 } = options;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin, threshold]);

  return [ref, inView];
}
