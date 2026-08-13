import { useLayoutEffect, useRef } from 'react';

export interface Rect {
  top: number;
  height: number;
  left: number;
  width: number;
}

const SLIDE_EASE = 'cubic-bezier(0.2, 0, 0, 1)';
const SLIDE_DURATION = 220;
const PILL_TRANSITION = `top ${SLIDE_DURATION}ms ${SLIDE_EASE}, left ${SLIDE_DURATION}ms ${SLIDE_EASE}, width ${SLIDE_DURATION}ms ${SLIDE_EASE}, height ${SLIDE_DURATION}ms ${SLIDE_EASE}`;
const BAR_REST_HEIGHT = 20;

export interface SlidingIndicatorProps {
  rect: Rect | null;
}

export function SlidingIndicator({ rect }: SlidingIndicatorProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const prevRectRef = useRef<Rect | null>(null);

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!rect) {
      prevRectRef.current = null;
      if (bar) bar.getAnimations().forEach((a) => a.cancel());
      return;
    }
    const prev = prevRectRef.current;
    if (bar && prev && (prev.top !== rect.top || prev.left !== rect.left)) {
      const oldCenter = prev.top + prev.height / 2;
      const newCenter = rect.top + rect.height / 2;
      const startTop = oldCenter - BAR_REST_HEIGHT / 2;
      const endTop = newCenter - BAR_REST_HEIGHT / 2;
      const stretchTop = Math.min(oldCenter, newCenter) - BAR_REST_HEIGHT / 2;
      const stretchHeight = Math.abs(newCenter - oldCenter) + BAR_REST_HEIGHT;

      bar.getAnimations().forEach((a) => a.cancel());
      bar.animate(
        [
          { top: `${startTop}px`, height: `${BAR_REST_HEIGHT}px`, offset: 0 },
          { top: `${stretchTop}px`, height: `${stretchHeight}px`, offset: 0.5 },
          { top: `${endTop}px`, height: `${BAR_REST_HEIGHT}px`, offset: 1 },
        ],
        { duration: SLIDE_DURATION, easing: SLIDE_EASE, fill: 'both' },
      );
    }
    prevRectRef.current = rect;
  }, [rect]);

  if (!rect) return null;

  return (
    <>
      {/* The active pill. Solid rather than faded to transparent: on the teal
          panel the row's text is the inverse of the pill, so a gradient would
          leave the end of a long label unreadable. */}
      <div
        aria-hidden
        className="pointer-events-none absolute z-0 rounded-md bg-sidebar-item-active shadow-sm"
        style={{
          top: rect.top,
          height: rect.height,
          left: 0,
          right: 0,
          transition: PILL_TRANSITION,
          willChange: 'top, height',
        }}
      />
      {/* Liquid stretching active indicator bar on the left with glowing accent */}
      <div
        ref={barRef}
        aria-hidden
        className="pointer-events-none absolute z-10 w-[3.5px] rounded-r-full bg-sidebar-item-marker"
        style={{
          top: rect.top + rect.height / 2 - BAR_REST_HEIGHT / 2,
          height: BAR_REST_HEIGHT,
          left: 0,
          willChange: 'top, height',
        }}
      />
    </>
  );
}
