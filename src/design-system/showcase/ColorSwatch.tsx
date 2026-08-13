import { cn } from '@/utils';

import { CopyableToken } from './CopyableToken';
import { formatColorValue } from './formatColor';
import { SpecRow } from './ShowcaseSection';
import { useTokenValue } from './useTokenValues';

/**
 * ColorSwatch — documents one semantic colour role.
 *
 * The preview adapts to how the role is actually used, because a flat fill
 * chip would misrepresent half the palette: a border token is only meaningful
 * as a line, and a text token only as text on its own background.
 *
 * The HEX shown is read from the live stylesheet, so it is correct for the
 * theme currently applied rather than a value copied into this file.
 */

export type ColorSwatchPreview = 'fill' | 'text' | 'border' | 'surface';

export interface ColorSwatchProps {
  /** Human-readable role name, e.g. "Primary". */
  name: string;
  /** CSS custom property, including the leading `--`. */
  token: string;
  /** Tailwind utility developers should reach for, e.g. `bg-primary`. */
  utility: string;
  preview?: ColorSwatchPreview;
  /** Where this role is used. Keeps the palette self-documenting. */
  usage?: string;
  /**
   * Foreground token paired with this role, previewed on top of the fill so the
   * contrast pairing is visible rather than assumed.
   */
  pairedForeground?: string;
  className?: string;
}

export function ColorSwatch({
  name,
  token,
  utility,
  preview = 'fill',
  usage,
  pairedForeground,
  className,
}: ColorSwatchProps) {
  const value = useTokenValue(token);

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-md border border-border bg-surface',
        className,
      )}
    >
      <ColorPreview token={token} preview={preview} pairedForeground={pairedForeground} />

      <dl className="space-y-1 p-3">
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
          <span className="type-mono text-muted-foreground">{formatColorValue(value)}</span>
        </SpecRow>
      </dl>
    </div>
  );
}

interface ColorPreviewProps {
  token: string;
  preview: ColorSwatchPreview;
  pairedForeground?: string;
}

function ColorPreview({ token, preview, pairedForeground }: ColorPreviewProps) {
  const base = 'flex h-20 shrink-0 items-center justify-center border-b border-border';

  if (preview === 'text') {
    return (
      <div className={cn(base, 'bg-background')}>
        <span style={{ color: `var(${token})` }} className="type-display">
          Aa
        </span>
      </div>
    );
  }

  if (preview === 'border') {
    return (
      <div className={cn(base, 'bg-background p-4')}>
        <div
          className="size-full rounded-md bg-surface"
          style={{ border: `var(--fl-border-width-thick) solid var(${token})` }}
        />
      </div>
    );
  }

  if (preview === 'surface') {
    // A surface against the page canvas — the only way to judge whether the two
    // actually separate.
    return (
      <div className={cn(base, 'bg-background p-3')}>
        <div
          className="size-full rounded-md border border-border"
          style={{ backgroundColor: `var(${token})` }}
        />
      </div>
    );
  }

  return (
    <div className={base} style={{ backgroundColor: `var(${token})` }}>
      {pairedForeground && (
        <span className="type-body-sm" style={{ color: `var(${pairedForeground})` }}>
          Aa
        </span>
      )}
    </div>
  );
}
