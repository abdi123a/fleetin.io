import { useEffect, useState } from 'react';

import { Button, Input, Spinner } from '@/design-system';
import { ArrowDown, ArrowUp, ListChecks, Plus, Trash2 } from '@/design-system/icons';
import { cn } from '@/utils';

import { useSetChecklist, useToggleChecklistItem } from '../api/queries';
import type { ChecklistItem } from '../contracts';

export interface TaskChecklistProps {
  taskRef: string;
  items: ChecklistItem[];
  className?: string;
}

/**
 * The steps a task breaks into.
 *
 * Flat and short by design — the plan rules out nested subtasks, and
 * "contact partner → request document → verify → update record" is a list, not
 * a tree.
 *
 * Two write paths on purpose: ticking a box is its own endpoint because it is
 * the thing people do fifty times a day, while adding, renaming, reordering
 * and deleting all replace the whole list. Reordering touches every row
 * anyway, so per-item PATCHes would be more traffic for a worse guarantee.
 */
export function TaskChecklist({ taskRef, items, className }: TaskChecklistProps) {
  const setChecklist = useSetChecklist();
  const toggle = useToggleChecklistItem();

  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  /* Mirrors the server so a tick feels instant; re-synced whenever the query
     comes back, so a failed write corrects itself rather than lying. */
  const [local, setLocal] = useState(items);
  useEffect(() => setLocal(items), [items]);

  const done = local.filter((i) => i.done).length;
  const total = local.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const busy = setChecklist.isPending;

  const save = (next: ChecklistItem[]) => {
    setLocal(next);
    setChecklist.mutate({
      taskRef,
      items: next.map((i) => ({ id: i.id.startsWith('new-') ? undefined : i.id, text: i.text, done: i.done })),
    });
  };

  const add = () => {
    if (!draft.trim()) return;
    save([
      ...local,
      {
        id: `new-${Date.now()}`, taskId: '', text: draft.trim(),
        done: false, doneAt: null, position: local.length,
      },
    ]);
    setDraft('');
  };

  const move = (index: number, by: -1 | 1) => {
    const target = index + by;
    if (target < 0 || target >= local.length) return;
    const next = [...local];
    const [row] = next.splice(index, 1);
    if (row) next.splice(target, 0, row);
    save(next);
  };

  return (
    <section className={cn('rounded-card border border-border bg-surface-raised', className)}>
      <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <ListChecks className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <h3 className="text-sm font-semibold text-foreground">Checklist</h3>

        {total > 0 ? (
          <>
            <span className="text-xs font-medium tabular-nums text-muted-foreground">
              {done}/{total}
            </span>
            {/* The bar is the point of the header: a fraction tells you the
                numbers, a bar tells you across a room. */}
            <span
              className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-sunken"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${done} of ${total} done`}
            >
              <span
                className={cn(
                  'block h-full rounded-full transition-[width] duration-normal',
                  done === total ? 'bg-success' : 'bg-primary',
                )}
                style={{ width: `${pct}%` }}
              />
            </span>
          </>
        ) : null}

        {busy ? <Spinner className="ml-auto size-3.5" /> : null}
      </header>

      <ul className="divide-y divide-border">
        {local.map((item, index) => (
          <li key={item.id} className="group/item flex items-center gap-2.5 px-4 py-2">
            <input
              type="checkbox"
              checked={item.done}
              aria-label={item.text}
              onChange={(event) => {
                const next = local.map((i) => (i.id === item.id ? { ...i, done: event.target.checked } : i));
                setLocal(next);
                if (!item.id.startsWith('new-')) {
                  toggle.mutate({ itemId: item.id, done: event.target.checked });
                }
              }}
              className="size-4 shrink-0 rounded-sm border-border accent-[var(--primary)]"
            />

            {editing === item.id ? (
              <Input
                value={editText}
                autoFocus
                onChange={(event) => setEditText(event.target.value)}
                onBlur={() => {
                  save(local.map((i) => (i.id === item.id ? { ...i, text: editText.trim() || i.text } : i)));
                  setEditing(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                  if (event.key === 'Escape') setEditing(null);
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => { setEditing(item.id); setEditText(item.text); }}
                className={cn(
                  'min-w-0 flex-1 truncate text-left text-sm transition-colors duration-fast',
                  item.done ? 'text-muted-foreground line-through' : 'text-foreground hover:text-primary-bold',
                )}
              >
                {item.text}
              </button>
            )}

            {/* Hover-revealed, and focusable so a keyboard reaches them. */}
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-fast focus-within:opacity-100 group-hover/item:opacity-100">
              <button
                type="button" aria-label="Move up" disabled={index === 0 || busy}
                onClick={() => move(index, -1)}
                className="rounded-sm p-1 text-muted-foreground hover:bg-surface-sunken hover:text-foreground disabled:opacity-30"
              >
                <ArrowUp className="size-3.5" aria-hidden />
              </button>
              <button
                type="button" aria-label="Move down" disabled={index === local.length - 1 || busy}
                onClick={() => move(index, 1)}
                className="rounded-sm p-1 text-muted-foreground hover:bg-surface-sunken hover:text-foreground disabled:opacity-30"
              >
                <ArrowDown className="size-3.5" aria-hidden />
              </button>
              <button
                type="button" aria-label={`Remove "${item.text}"`} disabled={busy}
                onClick={() => save(local.filter((i) => i.id !== item.id))}
                className="rounded-sm p-1 text-muted-foreground hover:bg-destructive-subtle hover:text-destructive"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2 border-t border-border px-4 py-2">
        <Input
          value={draft}
          placeholder="Add a step"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') add(); }}
        />
        <Button
          size="sm" shape="pill" variant="outline" disabled={!draft.trim() || busy}
          onClick={add} leadingIcon={<Plus className="h-3.5 w-3.5" />}
        >
          Add
        </Button>
      </div>
    </section>
  );
}
