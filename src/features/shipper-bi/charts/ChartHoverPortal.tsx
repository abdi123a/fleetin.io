import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/utils';

/**
 * Renders chart hover cards into document.body so they never clip against
 * overflow-hidden chart frames, tabs, or card edges (Apex tooltips can't do
 * this natively; custom scatter/quadrant tips need the same escape hatch).
 */
export function ChartHoverPortal({
  open,
  anchor,
  children,
  className,
  offset = 10,
}: {
  open: boolean;
  /** Anchor rect in viewport coordinates (from getBoundingClientRect). */
  anchor: DOMRect | null;
  children: ReactNode;
  className?: string;
  offset?: number;
}) {
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor) {
      setStyle(null);
      return;
    }

    const place = (rect: DOMRect) => {
      const preferAbove = rect.top > 140;
      const left = Math.min(
        Math.max(rect.left + rect.width / 2, 12),
        window.innerWidth - 12,
      );
      setStyle({
        position: 'fixed',
        left,
        top: preferAbove ? rect.top - offset : rect.bottom + offset,
        transform: preferAbove ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
        zIndex: 'var(--fl-z-tooltip)',
      });
    };

    place(anchor);

    const onMove = () => {
      // Re-read if the node is still in the tree via last known rect only —
      // callers refresh `anchor` on hover enter; scroll/resize just re-clamp.
      place(anchor);
    };

    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, anchor, offset]);

  if (!open || !style || typeof document === 'undefined') return null;

  return createPortal(
    <div className={cn('pointer-events-none', className)} style={style}>
      {children}
    </div>,
    document.body,
  );
}
