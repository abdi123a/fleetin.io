import type { ReactNode } from 'react';
import { ChevronDown } from '@/design-system/icons';
import { cn } from '@/utils';

/**
 * The header row shared by every console panel.
 *
 * Title left, one affordance right — nothing else. Each panel having its own
 * header meant six slightly different title sizes and a subtitle on some but
 * not others, which is what made the grid read as unrelated cards rather than
 * one console. The optional `hint` is the one addition: a panel that states
 * what it answers is a panel a first-time reader does not have to decode.
 */

/**
 * Every console panel carries the card shadow, and nothing else.
 *
 * `--background` now equals `--surface` (both #fff in light mode), so a panel
 * carries the card shadow to lift it off the page — the border-only default
 * reads flat on same-colour canvas. A
 * coloured rule along the top edge was tried as a second signal and dropped: on
 * a page where the hero, the queue header and the strip are already carrying
 * teal and orange, a stripe on every card is one more thing to look at and one
 * less thing that means anything.
 */
export const PANEL_SURFACE = 'shadow-card';

/**
 * Panels about something needing attention. Identical today — they earn their
 * colour from their own contents, not from a flag on the frame — but the two
 * names keep that a styling decision rather than a rewrite.
 */
export const PANEL_SURFACE_ALERT = 'shadow-card';

/**
 * The analytics band shell — a larger radius and more padding than the console
 * default.
 *
 * These two panels open the page and carry the only charts above the fold, so
 * they get the generosity: 20px corners against the console's 16px, and 24→28px
 * of padding against 24px flat. Still shadow-only — the rule in `PANEL_SURFACE`
 * about plain frames applies here too.
 */
export const BAND_SURFACE = 'rounded-lg p-6 shadow-card xl:p-7';

export interface PanelHeaderProps {
  title: string;
  /** One clause under the title saying what the panel answers. */
  hint?: string;
  /**
   * Critical hints use the same red pending-empty-return language as the
   * dashboard header pill — pulse + red chip — so urgency reads the same
   * wherever it appears.
   */
  hintCritical?: boolean;
  action?: ReactNode;
  className?: string;
}

export function PanelHeader({
  title,
  hint,
  hintCritical = false,
  action,
  className,
}: PanelHeaderProps) {
  return (
    <div className={cn('flex min-h-8 items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h3 className="type-h3 truncate text-foreground">{title}</h3>
        {hint ? (
          hintCritical ? (
            <p
              className="mt-1.5 inline-flex max-w-full items-center gap-2 rounded-full border border-destructive/40 bg-destructive-subtle px-3 py-1 text-xs font-bold text-destructive-subtle-foreground shadow-2xs dark:bg-destructive-subtle dark:text-destructive-subtle-foreground"
            >
              <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping motion-reduce:animate-none rounded-full bg-destructive opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
              </span>
              <span className="truncate tracking-tight">{hint}</span>
            </p>
          ) : (
            <p className="type-body-xs mt-0.5 truncate text-muted-foreground">{hint}</p>
          )
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function PanelLink({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="type-body-xs shrink-0 rounded-full bg-primary-subtle px-3 py-1.5 text-primary-subtle-foreground transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      {children}
    </button>
  );
}

/**
 * A static scope indicator — the window is driven by a picker elsewhere.
 *
 * `chevron` defaults to true for the panels whose window the page timeframe
 * picker sets, where the caret points the reader at the control they can reach.
 * Pass `chevron={false}` where the label is purely a statement of scope: a caret
 * on something that opens nothing is a promise the panel cannot keep.
 */
export function PanelScope({
  children,
  chevron = true,
}: {
  children: ReactNode;
  chevron?: boolean;
}) {
  return (
    <span className="type-body-xs inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 font-medium text-muted-foreground">
      {children}
      {chevron ? <ChevronDown className="size-3.5 opacity-60" aria-hidden /> : null}
    </span>
  );
}
