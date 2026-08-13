import { Check, Copy, type LucideIcon } from '@/design-system/icons';
import { useCallback, useEffect, useState } from 'react';


import { cn } from '@/utils';

/**
 * IconTile — one entry in the icon gallery.
 *
 * Clicking copies the import-ready component name, which is the thing a
 * developer actually needs from an icon gallery.
 */

export interface IconTileProps {
  icon: LucideIcon;
  /** Component name as exported by `lucide-react`, e.g. `TruckIcon` -> `Truck`. */
  name: string;
  /**
   * Second exported name for the same glyph. Shown because the registry ships
   * both and the app has picked at random between them — seeing the pair is
   * what stops the next call site adding a third spelling.
   */
  alias?: string;
  /** Why this icon rather than its near-twin. Surfaced as the tile's tooltip. */
  note?: string;
  className?: string;
}

const FEEDBACK_DURATION_MS = 1200;

export function IconTile({ icon: Icon, name, alias, note, className }: IconTileProps) {
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (!isCopied) return;
    const timer = window.setTimeout(() => setIsCopied(false), FEEDBACK_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [isCopied]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(name);
      setIsCopied(true);
    } catch {
      setIsCopied(false);
    }
  }, [name]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={[`Copy "${name}"`, alias && `also exported as ${alias}`, note]
        .filter(Boolean)
        .join(' — ')}
      className={cn(
        'group/icon relative flex flex-col items-center gap-2 rounded-md border border-border',
        'bg-surface px-2 py-3 transition-colors duration-fast',
        'hover:border-primary hover:bg-primary-subtle',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        className,
      )}
    >
      <Icon
        className="size-5 shrink-0 text-foreground transition-colors duration-fast group-hover/icon:text-primary"
        aria-hidden
      />
      <span className="type-caption w-full truncate text-center text-muted-foreground">
        {name}
      </span>
      {alias && (
        <span className="type-caption w-full truncate text-center text-muted-foreground/70">
          {alias}
        </span>
      )}

      <span
        className="absolute right-1.5 top-1.5 opacity-0 transition-opacity duration-fast group-hover/icon:opacity-100"
        aria-hidden
      >
        {isCopied ? (
          <Check className="size-3 text-success" />
        ) : (
          <Copy className="size-3 text-muted-foreground" />
        )}
      </span>

      <span className="sr-only">{isCopied ? 'Copied' : 'Copy icon name'}</span>
    </button>
  );
}
