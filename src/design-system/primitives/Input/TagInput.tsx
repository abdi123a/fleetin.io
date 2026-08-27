import { Copy, Plus, X } from '@/design-system/icons';

import { forwardRef, useMemo, useState, type ClipboardEvent, type KeyboardEvent } from 'react';

import { useFormField } from '@/design-system/primitives/Form/FormContext';
import { cn } from '@/utils';

export interface TagInputProps {
  /** Committed tag values. */
  value: string[];
  /** Called with the full updated tag list whenever it changes. */
  onChange: (values: string[]) => void;
  /** Placeholder shown in the trailing text field. */
  placeholder?: string;
  /** Applied to each value before it's committed as a tag (e.g. uppercasing). */
  transform?: (raw: string) => string;
  /**
   * How many tags the form is expecting. Tags past this are flagged as extra —
   * the last ones entered, since that is what a person removes to get back to
   * the count. Nothing is blocked: the field still accepts them, and the form
   * decides what an over-count means.
   */
  max?: number;
  /**
   * Values to flag as duplicates, when the caller knows better than this field
   * does. A container number repeated across a 20ft list and a 40ft list is a
   * duplicate, and neither field can see the other — so the form computes the
   * set once over every list and passes it down. Omitted, the field falls back
   * to spotting repeats within its own values.
   */
  duplicates?: ReadonlySet<string>;
  disabled?: boolean;
  className?: string;
}

/**
 * TagInput — a single field that turns comma/newline-separated or Enter-committed
 * text into removable chips, Gmail-recipient style. Paste splits on commas/newlines
 * so a whole list can be dropped in at once.
 */
export const TagInput = forwardRef<HTMLInputElement, TagInputProps>(function TagInput(
  {
    value,
    onChange,
    placeholder = 'Type and press Enter or comma...',
    transform,
    max,
    duplicates: duplicatesProp,
    disabled: propDisabled,
    className,
  },
  ref,
) {
  const { disabled: contextDisabled } = useFormField();
  const isDisabled = propDisabled ?? contextDisabled;

  const [draft, setDraft] = useState('');

  // Any value repeated elsewhere in the list renders as a duplicate chip —
  // an easy way to spot e.g. the same container number entered twice. Every
  // copy is marked, not just the second one: the point is to show the reader
  // which two chips collide, and highlighting one of a pair hides half of it.
  const ownDuplicates = useMemo(() => {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const v of value) {
      if (seen.has(v)) dupes.add(v);
      seen.add(v);
    }
    return dupes;
  }, [value]);
  const duplicates = duplicatesProp ?? ownDuplicates;

  const applyTransform = (raw: string) => (transform ? transform(raw) : raw);

  const commit = (raw: string) => {
    const parts = raw
      .split(/[\n,;]+/)
      .map((p) => applyTransform(p.trim()))
      .filter(Boolean);
    if (parts.length === 0) return;
    onChange([...value, ...parts]);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (draft.trim()) {
        commit(draft);
        setDraft('');
      }
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (/[\n,;]/.test(text)) {
      e.preventDefault();
      commit(text);
      setDraft('');
    }
  };

  const handleBlur = () => {
    if (draft.trim()) {
      commit(draft);
      setDraft('');
    }
  };

  const removeTag = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div
      className={cn(
        'flex w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-surface px-2.5 py-2 transition-all',
        'hover:border-border-strong focus-within:border-primary focus-within:ring-1 focus-within:ring-primary',
        isDisabled && 'cursor-not-allowed bg-surface-sunken opacity-70',
        className,
      )}
    >
      {value.map((tag, i) => {
        const isDuplicate = duplicates.has(tag);
        /* Past the count the form asked for. Flagged by position rather than by
           value, so it is the trailing chips that turn — the ones a person
           would delete to get back to the number they declared. */
        const isExtra = max !== undefined && i >= max;
        /* Duplicate wins where a chip is both: raising the count fixes an
           extra, but nothing makes two identical values legal. */
        const problem: 'duplicate' | 'extra' | null = isDuplicate
          ? 'duplicate'
          : isExtra
            ? 'extra'
            : null;
        /*
         * Two different problems, two different colours — and each matching the
         * banner that explains it. Every flagged chip used to render the same
         * red while the only message under the field talked about the count, so
         * a list with one repeat and one chip over the limit showed three
         * identical red chips and one explanation that fitted just one of them.
         * Red now means "this value is wrong", amber means "there are too many
         * of them", which is exactly the amber note underneath.
         */
        const problemLabel =
          problem === 'duplicate'
            ? 'Entered more than once'
            : problem === 'extra'
              ? 'More than the count above'
              : null;
        const ProblemIcon = problem === 'duplicate' ? Copy : problem === 'extra' ? Plus : null;
        return (
          <span
            key={`${tag}-${i}`}
            title={problemLabel ?? undefined}
            className={cn(
              'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
              problem === 'duplicate'
                ? /* `destructive`, not `danger` — this system has no danger
                     ramp, so the classes here were inert and a duplicate has
                     never actually rendered red. */
                  'bg-destructive-subtle text-destructive-subtle-foreground ring-1 ring-destructive/40'
                : problem === 'extra'
                  ? 'bg-warning-subtle text-warning-subtle-foreground ring-1 ring-warning/40'
                  : 'bg-primary-subtle text-primary-subtle-foreground',
            )}
          >
            {/* Colour is never the only signal, on screen or off it: the mark
                says which problem it is, and the reason is read out with the
                value. */}
            {ProblemIcon && <ProblemIcon className="h-3 w-3 shrink-0" aria-hidden />}
            {tag}
            {problemLabel && <span className="sr-only"> — {problemLabel}</span>}
            {!isDisabled && (
              <button
                type="button"
                onClick={() => removeTag(i)}
                aria-label={`Remove ${tag}`}
                className={cn(
                  'rounded-full p-0.5',
                  problem === 'duplicate'
                    ? 'hover:bg-destructive/20'
                    : problem === 'extra'
                      ? 'hover:bg-warning/20'
                      : 'hover:bg-primary/20',
                )}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        );
      })}
      <input
        ref={ref}
        type="text"
        disabled={isDisabled}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={handleBlur}
        placeholder={value.length === 0 ? placeholder : 'Add another...'}
        className="min-w-[140px] flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
    </div>
  );
});
