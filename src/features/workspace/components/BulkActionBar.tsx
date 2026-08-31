import { useState } from 'react';

import { CrewPicker } from '@/components/crew';
import { Button, DatePicker, Select, useConfirm } from '@/design-system';
import { UserRound, X } from '@/design-system/icons';
import { cn } from '@/utils';

import { useBulkUpdateTasks } from '../api/queries';
import type { BulkPayload } from '../api/workspaceService';
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from '../contracts';

export interface BulkActionBarProps {
  ids: string[];
  onClear: () => void;
  /** Widens the selection to the whole page. Omitted when it already is. */
  onSelectAll?: () => void;
  pageCount?: number;
  className?: string;
}

/**
 * What you can do to twenty tasks at once.
 *
 * Deliberately narrow — assign, status, priority, due, cancel — because the
 * plan's own warning bites hardest here: a bulk editor that can change any
 * field is how a task tool becomes a spreadsheet.
 *
 * Every row is re-authorised on the server, and a row the caller may not edit
 * comes back **skipped** rather than failing the whole call. Hence the result
 * line reading "12 updated · 3 skipped": a bar that refused all twenty because
 * one was off-limits would be useless to a manager sweeping a backlog.
 */
export function BulkActionBar({ ids, onClear, onSelectAll, pageCount, className }: BulkActionBarProps) {
  const bulk = useBulkUpdateTasks();
  const { confirm, confirmDialog } = useConfirm();
  const [note, setNote] = useState<string | null>(null);

  async function run(payload: Omit<BulkPayload, 'taskIds'>) {
    const result = await bulk.mutateAsync({ taskIds: ids, ...payload });
    setNote(
      result.skipped > 0
        ? `${result.updated} updated · ${result.skipped} skipped`
        : `${result.updated} updated`,
    );
    onClear();
  }

  async function cancelAll() {
    const ok = await confirm({
      title: `Cancel ${ids.length} ${ids.length === 1 ? 'task' : 'tasks'}?`,
      description: 'Cancelled tasks stay on their records and in history — they just stop being work.',
      confirmLabel: 'Cancel tasks',
      destructive: true,
    });
    if (ok) await run({ status: 'CANCELLED' });
  }

  /* The result line outlives the selection on purpose — clearing is the last
     thing `run` does, so without this the only feedback would vanish with the
     bar that produced it. */
  if (ids.length === 0) {
    return note ? (
      <p className="rounded-card border border-success bg-success-subtle px-3 py-2 text-xs text-success-subtle-foreground">
        {note}
      </p>
    ) : null;
  }

  return (
    <div
      className={cn(
        'sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-card border border-primary bg-primary-subtle px-3 py-2.5 shadow-card',
        className,
      )}
    >
      <span className="mr-1 shrink-0 text-sm font-bold text-primary-subtle-foreground">
        {ids.length} selected
      </span>

      {onSelectAll && pageCount ? (
        <button
          type="button"
          onClick={onSelectAll}
          className="mr-1 shrink-0 text-xs font-medium text-primary-bold underline-offset-2 hover:underline"
        >
          Select all {pageCount}
        </button>
      ) : null}

      <Select
        selectSize="sm"
        aria-label="Set status"
        value=""
        disabled={bulk.isPending}
        containerClassName="w-36"
        onChange={(event) => {
          const value = event.target.value as TaskStatus | '';
          if (value) void run({ status: value });
        }}
        options={[
          { value: '', label: 'Status…' },
          ...TASK_STATUSES.map((status) => ({ value: status, label: TASK_STATUS_LABEL[status] })),
        ]}
      />

      <Select
        selectSize="sm"
        aria-label="Set priority"
        value=""
        disabled={bulk.isPending}
        containerClassName="w-32"
        onChange={(event) => {
          const value = event.target.value as TaskPriority | '';
          if (value) void run({ priority: value });
        }}
        options={[
          { value: '', label: 'Priority…' },
          ...TASK_PRIORITIES.map((p) => ({ value: p, label: TASK_PRIORITY_LABEL[p] })),
        ]}
      />

      <CrewPicker
        value={[]}
        busy={bulk.isPending}
        onChange={(userIds) => void run({ assigneeId: userIds.at(-1) ?? null })}
      >
        <Button variant="outline" size="sm" className="text-xs" leadingIcon={<UserRound className="size-3.5" />}>
          Assign
        </Button>
      </CrewPicker>

      <DatePicker
        placeholder="Set due"
        isClearable={false}
        disabled={bulk.isPending}
        onChange={(value) => { if (value) void run({ dueAt: value }); }}
        className="w-36"
      />

      <Button variant="outline" size="sm" onClick={cancelAll} disabled={bulk.isPending} className="text-xs">
        Cancel tasks
      </Button>

      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selection"
        className="ml-auto rounded-sm p-1 text-primary-subtle-foreground transition-colors duration-fast hover:bg-primary/10"
      >
        <X className="size-4" aria-hidden />
      </button>

      {confirmDialog}
    </div>
  );
}
