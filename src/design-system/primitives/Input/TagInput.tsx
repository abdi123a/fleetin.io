import { X } from '@/design-system/icons';

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
  disabled?: boolean;
  className?: string;
}

/**
 * TagInput — a single field that turns comma/newline-separated or Enter-committed
 * text into removable chips, Gmail-recipient style. Paste splits on commas/newlines
 * so a whole list can be dropped in at once.
 */
export const TagInput = forwardRef<HTMLInputElement, TagInputProps>(function TagInput(
  { value, onChange, placeholder = 'Type and press Enter or comma...', transform, disabled: propDisabled, className },
  ref,
) {
  const { disabled: contextDisabled } = useFormField();
  const isDisabled = propDisabled ?? contextDisabled;

  const [draft, setDraft] = useState('');

  // Any value repeated elsewhere in the list renders as a duplicate chip —
  // an easy way to spot e.g. the same container number entered twice.
  const duplicates = useMemo(() => {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const v of value) {
      if (seen.has(v)) dupes.add(v);
      seen.add(v);
    }
    return dupes;
  }, [value]);

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
        return (
          <span
            key={`${tag}-${i}`}
            className={cn(
              'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
              isDuplicate
                ? 'bg-danger-subtle text-danger-subtle-foreground ring-1 ring-danger/40'
                : 'bg-primary-subtle text-primary-subtle-foreground',
            )}
          >
            {tag}
            {!isDisabled && (
              <button
                type="button"
                onClick={() => removeTag(i)}
                aria-label={`Remove ${tag}`}
                className={cn('rounded-full p-0.5', isDuplicate ? 'hover:bg-danger/20' : 'hover:bg-primary/20')}
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
