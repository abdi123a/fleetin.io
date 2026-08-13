import { ArrowUpRight } from '@/design-system/icons';
import { cn } from '@/utils';

/**
 * Soft circular expand affordance used on GLOBALRIDE-style overview panels.
 * Keeps every card's "go deeper" cue identical so the grid reads as one console.
 */
export function ExpandLink({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary transition-colors',
        'hover:bg-primary hover:text-primary-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        className,
      )}
    >
      <ArrowUpRight className="size-3.5" strokeWidth={2.25} />
    </button>
  );
}

export default ExpandLink;
