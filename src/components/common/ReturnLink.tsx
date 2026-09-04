import { Link, useLocation } from 'react-router-dom';

import { ArrowLeft } from '@/design-system/icons';
import { cn } from '@/utils';

/**
 * Where the reader came from, when they came from somewhere in particular.
 *
 * A record page is reachable from its own list and from half a dozen work
 * surfaces that link straight to it — an invoice opened from Billing's open
 * items, a shipment opened from a payable. Those pages all carried one fixed
 * back control pointing at their own list, so following a link out of a
 * worklist stranded the reader: the only way back to the queue they were
 * working was the browser's own button, and the page gave no sign it existed.
 *
 * The linking page states its return in `state`, and the destination renders
 * it instead of its default. Nothing changes for a reader who arrived the
 * ordinary way, because `state` is empty and `useReturnTo` gives back null.
 */
export interface ReturnTo {
  /** Path to go back to. */
  to: string;
  /** What to call it — the destination's own name, never "Back". */
  label: string;
}

/** Build the `state` a link passes so its destination can offer the way back. */
export function returnState(to: string, label: string): { returnTo: ReturnTo } {
  return { returnTo: { to, label } };
}

/** The return the current navigation carried, or null if it carried none. */
export function useReturnTo(): ReturnTo | null {
  const state = useLocation().state as { returnTo?: ReturnTo } | null;
  const returnTo = state?.returnTo;
  /* Route state survives a reload and comes back as whatever was serialised,
     so it is checked rather than trusted — a malformed entry renders nothing
     instead of an empty control that goes nowhere. */
  if (!returnTo || typeof returnTo.to !== 'string' || typeof returnTo.label !== 'string') {
    return null;
  }
  return returnTo;
}

/**
 * The back control itself.
 *
 * Falls through to `fallback` when the reader did not arrive from a worklist,
 * so a page can render this in place of its own hand-rolled control and keep
 * the behaviour it already had.
 */
export function ReturnLink({
  fallback,
  className,
}: {
  /** Where this page goes back to when nothing was passed — usually its list. */
  fallback: ReturnTo;
  className?: string;
}) {
  const returnTo = useReturnTo() ?? fallback;

  return (
    <Link
      to={returnTo.to}
      className={cn(
        'flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground',
        className,
      )}
    >
      <ArrowLeft aria-hidden className="size-4" />
      {returnTo.label}
    </Link>
  );
}
