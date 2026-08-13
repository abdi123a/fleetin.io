import { Check, Copy } from '@/design-system/icons';

import { useCallback, useEffect, useState } from 'react';

import { cn } from '@/utils';

/**
 * CopyableToken — a monospace token value that copies to the clipboard.
 *
 * The whole point of the showcase is that developers take values *from* it, so
 * every token name and utility class is one click away from being pasted into
 * code. Falls back to plain text when the Clipboard API is unavailable rather
 * than rendering a button that silently does nothing.
 */

export interface CopyableTokenProps {
  /** Text shown to the reader. */
  label: string;
  /** Text placed on the clipboard. Defaults to `label`. */
  value?: string;
  /** Visual weight — `strong` is for the primary identifier of a row. */
  emphasis?: 'strong' | 'muted';
  /**
   * Renders as a wrapping code block instead of a single truncated line.
   * Used for usage snippets, which must not be clipped.
   */
  multiline?: boolean;
  className?: string;
}

const CLIPBOARD_AVAILABLE =
  typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function';

const FEEDBACK_DURATION_MS = 1200;

export function CopyableToken({
  label,
  value,
  emphasis = 'muted',
  multiline = false,
  className,
}: CopyableTokenProps) {
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (!isCopied) return;
    const timer = window.setTimeout(() => setIsCopied(false), FEEDBACK_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [isCopied]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value ?? label);
      setIsCopied(true);
    } catch {
      // Clipboard permission denied — leave the value visible for manual copy.
      setIsCopied(false);
    }
  }, [label, value]);

  const textClass = cn(
    'type-mono',
    multiline ? 'whitespace-pre-wrap text-left' : 'truncate',
    emphasis === 'strong' ? 'text-foreground' : 'text-muted-foreground',
  );

  if (!CLIPBOARD_AVAILABLE) {
    return <span className={cn(textClass, className)}>{label}</span>;
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Copy "${value ?? label}"`}
      className={cn(
        'group/copy flex min-w-0 max-w-full gap-1.5 rounded-sm',
        multiline ? 'w-full items-start' : 'inline-flex items-center',
        'transition-colors duration-fast hover:text-primary',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        textClass,
        className,
      )}
    >
      <span className={cn('min-w-0', multiline ? 'flex-1' : 'truncate')}>{label}</span>
      {isCopied ? (
        <Check className="size-3 shrink-0 text-success" aria-hidden />
      ) : (
        <Copy
          className={cn(
            'size-3 shrink-0 transition-opacity duration-fast',
            multiline ? 'mt-0.5 opacity-40' : 'opacity-0',
            'group-hover/copy:opacity-60',
          )}
          aria-hidden
        />
      )}
      <span className="sr-only">{isCopied ? 'Copied' : 'Copy to clipboard'}</span>
    </button>
  );
}
