import { ArrowRight, Container, Plus } from '@/design-system/icons';
import { cn } from '@/utils';

import { Mono } from '../atoms';

export interface ContainerSwapProps {
  empty: string;
  full?: string | null;
  /** Called when the operator activates the dashed “Select target” action. */
  onSelectTarget?: () => void;
  className?: string;
}

/**
 * Empty inbound → full outbound: the sentence every row of this module is.
 *
 * Two boxes inside one box, and the nesting is the point. Each container gets
 * its own round pill because each is a real, separately-trackable thing — the
 * empty going back in neutral, the full load it carries out in brand teal —
 * and the shell around the pair says the two are one swap, not two unrelated
 * numbers that happen to share a row. The arrow lives inside the shell for the
 * same reason.
 */
export function ContainerSwap({ empty, full, onSelectTarget, className }: ContainerSwapProps) {
  const pending = !full;

  return (
    <div
      aria-label={
        pending
          ? `Empty ${empty} returning, full load target not selected`
          : `Empty ${empty} returning, full ${full} outbound`
      }
      className={cn(
        // The combining box — fully round, like the two pills it holds, so the
        // pair reads as one object. It wraps rather than overflows, so on a
        // phone the pills stack inside the shell instead of leaving the card.
        'inline-flex min-w-0 max-w-full flex-wrap items-center gap-1.5 rounded-full border border-border bg-muted/40 p-1',
        className,
      )}
    >
      {/* The box going back. */}
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 shadow-2xs">
        {/* The glyph is the first thing to go when width is short: below
            1024px the pair only fits one line without it, and a wrapped swap
            doubles every row's height. */}
        <Container className="hidden size-3.5 shrink-0 text-muted-foreground lg:block" aria-hidden />
        <Mono className="text-xs font-semibold tracking-tight text-foreground">{empty}</Mono>
      </span>

      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden />

      {pending ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelectTarget?.();
          }}
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-primary/50 bg-background',
            'px-2 py-0.5 text-[11px] font-medium text-primary',
            'transition duration-150 hover:border-primary hover:bg-primary-subtle hover:text-primary-bold',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          )}
        >
          <Plus className="size-3" aria-hidden />
          Select target
        </button>
      ) : (
        /* The load it carries out. */
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary-subtle px-2 py-0.5 shadow-2xs">
          <Container
            className="hidden size-3.5 shrink-0 fill-primary/15 text-primary lg:block"
            aria-hidden
          />
          <Mono className="text-xs font-semibold tracking-tight text-primary">{full}</Mono>
        </span>
      )}
    </div>
  );
}
