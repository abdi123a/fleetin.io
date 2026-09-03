import { ChevronRight } from '@/design-system/icons';
import { cn } from '@/utils';

/**
 * Where you are, and every way back.
 *
 * The root is a step like any other, so leaving a folder never needs the
 * browser's Back. `onStep(index)` is asked to return to that level — index 0
 * is the root.
 */
export function DriveTrail({
  steps,
  onStep,
}: {
  steps: { key: string; label: string }[];
  onStep: (index: number) => void;
}) {
  return (
    <nav className="flex min-w-0 flex-wrap items-center gap-0.5" aria-label="Folder">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        return (
          <span key={`${step.key}-${index}`} className="flex min-w-0 items-center gap-0.5">
            {index > 0 && (
              <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <button
              type="button"
              disabled={last}
              onClick={() => onStep(index)}
              className={cn(
                'max-w-[16rem] truncate rounded-md px-1.5 py-1 text-sm transition-colors',
                last
                  ? 'cursor-default font-bold text-foreground'
                  : 'font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {step.label}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
