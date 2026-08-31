import * as Popover from '@radix-ui/react-popover';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { Avatar, Button, Spinner, Textarea } from '@/design-system';
import { Send } from '@/design-system/icons';
import { useTeam } from '@/features/team';
import { resolveAssetUrl } from '@/services/api.client';
import { cn } from '@/utils';

import { RECORD_TYPE_LABEL } from '../contracts';
import { useRecordSearch } from '../api/queries';
import { displayRecord, displayUser, materializeBody, serializeRecord, serializeUser } from './tokens';
import { applyToken, useTypeahead } from './useTypeahead';

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  /**
   * Receives the body with every picked name and reference turned back into a
   * storage token. Callers must send THIS, not their own `value` — that one
   * still holds the readable display text.
   */
  onSubmit: (body: string) => void;
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
  /** What gets stored. */
  token: string;
  /** What the writer sees while typing. */
  display: string;
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
  /* display -> token, for everything picked in this draft. A ref, not state:
     nothing renders from it, and re-rendering on every pick would fight the
     caret restore below. */
  const tokensByDisplay = useRef(new Map<string, string>());
  const { trigger, setCaret, dismiss } = useTypeahead(value);
  const [activeIndex, setActiveIndex] = useState(0);

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
          display: displayUser(m.fullName),
          primary: m.fullName,
          secondary: m.roleName,
          avatarUrl: m.avatarUrl,
        }));
    }

    return records.slice(0, 10).map((r) => ({
      key: `${r.type}:${r.id}`,
      token: serializeRecord(r.type, r.reference, r.subtitle, r.parentRef),
      display: displayRecord(r.reference),
      primary: r.reference,
      secondary: r.status ? [r.subtitle, r.status].filter(Boolean).join(' · ') : r.subtitle,
      badge: RECORD_TYPE_LABEL[r.type],
    }));
  }, [trigger, team, records]);

  const open = Boolean(trigger) && (options.length > 0 || recordsFetching || teamLoading);
  const active = Math.min(activeIndex, Math.max(0, options.length - 1));

  /**
   * The value split into the bits that resolved and the bits that did not.
   *
   * Longest display first, so one name sitting inside another does not get
   * half-marked.
   */
  const highlighted = useMemo(() => {
    const displays = [...tokensByDisplay.current.keys()]
      .filter((d) => value.includes(d))
      .sort((a, b) => b.length - a.length);
    if (displays.length === 0) return [{ text: value, resolved: false }];

    let pieces: { text: string; resolved: boolean }[] = [{ text: value, resolved: false }];
    for (const display of displays) {
      pieces = pieces.flatMap((piece) => {
        if (piece.resolved) return [piece];
        return piece.text
          .split(display)
          .flatMap((part, index) =>
            index === 0
              ? [{ text: part, resolved: false }]
              : [{ text: display, resolved: true }, { text: part, resolved: false }],
          )
          .filter((part) => part.text.length > 0);
      });
    }
    return pieces;
  }, [value]);

  function syncCaret() {
    setCaret(textareaRef.current?.selectionStart ?? 0);
  }

  /** Hand the caller storage tokens, not the readable text on screen. */
  function submit() {
    onSubmit(materializeBody(value, tokensByDisplay.current));
  }

  function choose(option: Option) {
    if (!trigger) return;
    tokensByDisplay.current.set(option.display, option.token);
    const next = applyToken(value, trigger, option.display);
    onChange(next.value);
    setActiveIndex(0);
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
        setActiveIndex((h) => (h + 1) % options.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((h) => (h - 1 + options.length) % options.length);
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
      if (value.trim() && !busy) submit();
    }
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Popover.Root open={open}>
        <Popover.Anchor asChild>
          {/*
           * A mirror behind the textarea, drawing the same characters with the
           * resolved names and references marked.
           *
           * This only works because the composer now shows DISPLAY text rather
           * than storage tokens: the mirror and the field hold identical
           * strings, so every glyph lands in the same place and the caret
           * stays honest. With a uuid in the field it could never line up.
           *
           * The mark is confirmation, not decoration — it is how somebody
           * knows `@Fatouma Abdillahi` actually resolved to a person rather
           * than being three words they typed.
           */}
          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded-md px-3 py-2 text-sm"
            >
              {highlighted.map((piece, index) =>
                piece.resolved ? (
                  <mark
                    key={index}
                    className="rounded-sm bg-primary-subtle text-primary-bold"
                  >
                    {piece.text}
                  </mark>
                ) : (
                  <span key={index} className="invisible">{piece.text}</span>
                ),
              )}
            </div>
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
                setActiveIndex(0);
              }}
              onKeyUp={syncCaret}
              onClick={syncCaret}
              onKeyDown={handleKeyDown}
              className="relative bg-transparent"
            />
          </div>
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
                      onMouseEnter={() => setActiveIndex(index)}
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
            onClick={submit}
            leadingIcon={busy ? <Spinner className="size-3.5" /> : <Send className="size-3.5" />}
          >
            Send
          </Button>
        </div>
      ) : null}
    </div>
  );
}
