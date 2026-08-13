import { cn } from '@/utils';

import { CopyableToken } from './CopyableToken';
import { SpecRow } from './ShowcaseSection';
import { useTokenValue } from './useTokenValues';

/**
 * ShadowSpecimen — documents one elevation token.
 *
 * Elevation is theme-dependent in a way colour is not: the dark theme flattens
 * shadows and separates surfaces by lightness instead, so the value shown here
 * changes with the active theme. That is the behaviour being documented, not a
 * bug in the swatch.
 */

export interface ShadowSpecimenProps {
  name: string;
  /** Semantic elevation property, e.g. `--elevation-md`. */
  token: string;
  /** Tailwind utility, e.g. `shadow-md`. */
  utility: string;
  usage?: string;
  className?: string;
}

export function ShadowSpecimen({
  name,
  token,
  utility,
  usage,
  className,
}: ShadowSpecimenProps) {
  const value = useTokenValue(token);
  const isFlat = !value || value === 'none' || /^0 0 #0000$/.test(value.trim());

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-md border border-border bg-surface',
        className,
      )}
    >
      {/* Generous padding so the blur has room to fall off rather than being
          clipped by the preview edge. */}
      <div className="flex h-28 items-center justify-center bg-background p-6">
        <div
          className="size-full rounded-md border border-border bg-surface"
          style={{ boxShadow: `var(${token})` }}
        />
      </div>

      <dl className="space-y-1 border-t border-border p-3">
        <div className="mb-1.5 space-y-0.5">
          <p className="type-body-sm font-medium text-foreground">{name}</p>
          {usage && <p className="type-caption text-muted-foreground">{usage}</p>}
        </div>

        <SpecRow label="Token">
          <CopyableToken label={token} emphasis="strong" />
        </SpecRow>
        <SpecRow label="Utility">
          <CopyableToken label={utility} />
        </SpecRow>
        <SpecRow label="Value">
          <span
            className="type-mono block truncate text-muted-foreground"
            title={value || undefined}
          >
            {isFlat ? 'none (flattened in this theme)' : value}
          </span>
        </SpecRow>
      </dl>
    </div>
  );
}
