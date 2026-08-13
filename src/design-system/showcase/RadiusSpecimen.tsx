import { cn } from '@/utils';

import { CopyableToken } from './CopyableToken';
import { SpecRow } from './ShowcaseSection';
import { useTokenValue } from './useTokenValues';

/**
 * RadiusSpecimen — documents one corner-radius token.
 *
 * The preview corner is drawn oversized and cropped so the curve is legible at
 * small radii, where a full rounded box makes 4px and 6px indistinguishable.
 */

export interface RadiusSpecimenProps {
  name: string;
  /** CSS custom property, e.g. `--fl-radius-md`. */
  token: string;
  /** Tailwind utility, e.g. `rounded-md`. */
  utility: string;
  usage?: string;
  className?: string;
}

export function RadiusSpecimen({
  name,
  token,
  utility,
  usage,
  className,
}: RadiusSpecimenProps) {
  const value = useTokenValue(token);

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-md border border-border bg-surface',
        className,
      )}
    >
      <div className="flex h-24 items-end justify-center overflow-hidden bg-background px-4 pt-4">
        <div
          className="size-full border-2 border-b-0 border-primary bg-primary-subtle"
          style={{
            borderTopLeftRadius: `var(${token})`,
            borderTopRightRadius: `var(${token})`,
          }}
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
          <span className="type-mono text-muted-foreground">{value || '—'}</span>
        </SpecRow>
      </dl>
    </div>
  );
}
