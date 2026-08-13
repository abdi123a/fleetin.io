import { ArrowRight, Plus } from '@/design-system/icons';
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
 * Modern Container Swap presentation: Empty Inbound → Full Outbound.
 * Clean pill container with clear directional flow and actionable placeholder.
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
        'inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-border/80 bg-muted/30 px-2 py-1 transition-colors hover:bg-muted/50',
        className,
      )}
    >
      <span className="inline-flex shrink-0 items-center gap-1">
        <span className="inline-flex size-1.5 rounded-full bg-muted-foreground/60" aria-hidden />
        <Mono className="text-xs font-semibold text-foreground tracking-tight">{empty}</Mono>
      </span>

      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />

      {pending ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelectTarget?.();
          }}
          className={cn(
            'inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border border-dashed border-primary/40 bg-primary-subtle/40',
            'px-1.5 text-[11px] font-medium text-primary',
            'transition duration-150 hover:border-primary hover:bg-primary-subtle hover:text-primary-bold',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          )}
        >
          <Plus className="size-2.5" aria-hidden />
          Select target
        </button>
      ) : (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-primary/10 px-1.5 py-0.5 text-primary-subtle-foreground">
          <Mono className="text-xs font-semibold text-primary">{full}</Mono>
        </span>
      )}
    </div>
  );
}

