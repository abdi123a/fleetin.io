import * as Popover from '@radix-ui/react-popover';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { Avatar, Button, Spinner, Textarea } from '@/design-system';
import { Send } from '@/design-system/icons';
import { useTeam } from '@/features/team';
import { resolveAssetUrl } from '@/services/api.client';
import { cn } from '@/utils';

import { RECORD_TYPE_LABEL } from '../contracts';
import { useRecordSearch } from '../api/queries';
import { serializeRecord, serializeUser } from './tokens';
import { applyToken, useTypeahead } from './useTypeahead';

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  busy?: boolean;
  /** Hidden on the compact Raise form, where the dialog has its own buttons. */
  showSubmit?: boolean;
  autoFocus?: boolean;
  rows?: number;
  className?: string;
}

interface Option {
  key: string;
  token: string;
  primary: string;
  secondary: string | null;
  avatarUrl?: string | null;
  badge?: string;
}

/**
 * One composer, used in every position — a task's thread, and the Raise
 * popover on a record page.
 *
 * Two triggers and no rich text. `@` names a person, `/` names a Fleetin
 * record, and everything else is plain characters. The `RichTextEditor`
 * primitive was not reused: it wraps the entire content in a tag, has no
 * selection handling and is imported by nothing, so there was no editor
 * architecture to fit into — only the appearance of one.
 *
 * `/` is the reason this feature exists. A reference in a WhatsApp message is
 * six characters somebody has to go and look up; here it becomes a link.
 */
export function Composer({
  value, onChange, onSubmit, placeholder = 'Write a message, or type / to reference a record',
  busy = false, showSubmit = true, autoFocus = false, rows = 3, className,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { trigger, setCaret, dismiss } = useTypeahead(value);
  const [highlighted, setHighlighted] = useState(0);

  const { data: team = [], isLoading: teamLoading } = useTeam();
  const recordQuery = trigger?.char === '/' ? trigger.query : '';
  const { data: records = [], isFetching: recordsFetching } = useRecordSearch(recordQuery);

  const options = useMemo<Option[]>(() => {
    if (!trigger) return [];

    if (trigger.char === '@') {
      const q = trigger.query.toLowerCase();
      return team
        .filter((m) => !q || m.fullName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
        .slice(0, 8)
        .map((m) => ({
          key: m.id,
          token: serializeUser(m.id, m.fullName),
          primary: m.fullName,
          secondary: m.roleName,
          avatarUrl: m.avatarUrl,
        }));
    }

    return records.slice(0, 10).map((r) => ({
      key: `${r.type}:${r.id}`,
      token: serializeRecord(r.type, r.reference, r.subtitle, r.parentRef),
      primary: r.reference,
      secondary: r.status ? [r.subtitle, r.status].filter(Boolean).join(' · ') : r.subtitle,
      badge: RECORD_TYPE_LABEL[r.type],
    }));
  }, [trigger, team, records]);

  const open = Boolean(trigger) && (options.length > 0 || recordsFetching || teamLoading);
  const active = Math.min(highlighted, Math.max(0, options.length - 1));

  function syncCaret() {
    setCaret(textareaRef.current?.selectionStart ?? 0);
  }

  function choose(option: Option) {
    if (!trigger) return;
    const next = applyToken(value, trigger, option.token);
    onChange(next.value);
    setHighlighted(0);
    /* Put the caret back after React has written the new value, or the
       browser drops it to the end and the sentence is typed backwards. */
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
      setCaret(next.caret);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (open && options.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlighted((h) => (h + 1) % options.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlighted((h) => (h - 1 + options.length) % options.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const option = options[active];
        if (option) choose(option);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        dismiss();
        return;
      }
    }

    /* Cmd/Ctrl+Enter posts; a plain Enter is a newline. Same contract the
       withdrawn CommentThread used, so the habit survives. */
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (value.trim() && !busy) onSubmit();
    }
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Popover.Root open={open}>
        <Popover.Anchor asChild>
          <Textarea
            ref={textareaRef}
            value={value}
            rows={rows}
            autoFocus={autoFocus}
            disabled={busy}
            placeholder={placeholder}
            resizable={false}
            onChange={(event) => {
              onChange(event.target.value);
              setCaret(event.target.selectionStart ?? 0);
              setHighlighted(0);
            }}
            onKeyUp={syncCaret}
            onClick={syncCaret}
            onKeyDown={handleKeyDown}
          />
        </Popover.Anchor>

        <Popover.Portal>
          <Popover.Content
            side="top"
            align="start"
            sideOffset={6}
            /* The textarea keeps focus throughout: this is a typeahead, not a
               menu you tab into. Every interaction is a keystroke in the field. */
            onOpenAutoFocus={(event) => event.preventDefault()}
            className="z-popover w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-card border border-border bg-surface-raised shadow-card"
          >
            <div className="border-b border-border px-3 py-1.5 text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
              {trigger?.char === '@' ? 'People' : 'Fleetin records'}
            </div>

            {options.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                {recordsFetching || teamLoading ? (
                  <><Spinner className="size-3.5" /> Searching…</>
                ) : (
                  <>Nothing matches “{trigger?.query}”</>
                )}
              </div>
            ) : (
              <ul className="max-h-64 overflow-y-auto py-1">
                {options.map((option, index) => (
                  <li key={option.key}>
                    <button
                      type="button"
                      onMouseEnter={() => setHighlighted(index)}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        choose(option);
                      }}
                      className={cn(
                        'flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors duration-fast',
                        index === active ? 'bg-primary-subtle' : 'hover:bg-surface-sunken',
                      )}
                    >
                      {trigger?.char === '@' ? (
                        <Avatar size="xs" name={option.primary} src={resolveAssetUrl(option.avatarUrl ?? undefined)} />
                      ) : (
                        <span className="shrink-0 rounded-sm bg-surface-sunken px-1.5 py-0.5 text-[0.625rem] font-medium text-muted-foreground">
                          {option.badge}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-foreground">{option.primary}</span>
                        {option.secondary ? (
                          <span className="block truncate text-[0.6875rem] text-muted-foreground">{option.secondary}</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {showSubmit ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[0.6875rem] text-muted-foreground">
            <kbd className="font-mono">⌘</kbd>+<kbd className="font-mono">Enter</kbd> to send · <kbd className="font-mono">/</kbd> for records
          </span>
          <Button
            size="sm"
            shape="pill"
            disabled={!value.trim() || busy}
            onClick={onSubmit}
            leadingIcon={busy ? <Spinner className="size-3.5" /> : <Send className="size-3.5" />}
          >
            Send
          </Button>
        </div>
      ) : null}
    </div>
  );
}
