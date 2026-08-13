import { cn } from '@/utils';

import { CopyableToken } from './CopyableToken';
import { useTokenValue } from './useTokenValues';

/**
 * SpacingSpecimen — one step of the 4px spacing grid.
 *
 * Rendered as a proportional bar rather than a card, so the whole scale reads
 * as a ramp when the steps are stacked: the relationship between steps is the
 * thing worth seeing, and it disappears if each value is boxed separately.
 */

export interface SpacingSpecimenProps {
  /** Step name, e.g. "16". */
  name: string;
  /** CSS custom property, e.g. `--fl-space-4`. */
  token: string;
  /** Tailwind step suffix, e.g. `4` — used for `p-4`, `gap-4`, `m-4`. */
  step: string;
  /** Rendered width as a percentage of the largest step in the scale. */
  scale: number;
  usage?: string;
  className?: string;
}

export function SpacingSpecimen({
  name,
  token,
  step,
  scale,
  usage,
  className,
}: SpacingSpecimenProps) {
  const value = useTokenValue(token);

  return (
    <div
      className={cn(
        'grid items-center gap-x-4 gap-y-1 py-2',
        'grid-cols-[3.5rem_minmax(0,1fr)] sm:grid-cols-[3.5rem_minmax(0,1fr)_9rem_11rem]',
        className,
      )}
    >
      <div className="type-mono text-right text-foreground">{name}</div>

      <div className="flex min-w-0 items-center gap-3">
        <div
          className="h-5 shrink-0 rounded-sm bg-primary"
          style={{ width: `${scale}%` }}
          aria-hidden
        />
        {usage && (
          <span className="type-caption hidden truncate text-muted-foreground xl:block">
            {usage}
          </span>
        )}
      </div>

      <div className="col-start-2 sm:col-start-3">
        <span className="type-mono text-muted-foreground">{value || '—'}</span>
      </div>

      <div className="col-start-2 min-w-0 sm:col-start-4">
        <CopyableToken label={token} value={token} />
        <span className="type-caption ml-2 text-muted-foreground/70">p-{step}</span>
      </div>
    </div>
  );
}
