import { useState } from 'react';

import { Button, IconChip, Spinner, useConfirm } from '@/design-system';
import { CalendarDays, ListChecks, Pencil, Plus, RefreshCw, Repeat, Trash2 } from '@/design-system/icons';
import {
  PersonAvatar, RecurrenceDialog, TemplateDialog,
  describeRecurrence,
  useArchiveTemplate, useDeleteRecurrence, useRecurrences, useRunRecurrences,
  useTemplates, useUpdateRecurrence,
  TASK_PRIORITY_LABEL, type TaskRecurrence,
} from '@/features/workspace';
import { cn, formatDate } from '@/utils';

/**
 * The standing arrangements: rules that file work, and templates that shape it.
 *
 * Its own screen rather than a tab on Tasks, because everything here describes
 * work that **does not exist yet** — a rule listed among live tasks reads as a
 * task nobody has done, which is exactly what it is not.
 */
export function WorkspaceAutomationPage() {
  const { data: rules = [], isLoading: rulesLoading } = useRecurrences();
  const { data: templates = [], isLoading: templatesLoading } = useTemplates();
  const toggleRule = useUpdateRecurrence();
  const removeRule = useDeleteRecurrence();
  const archiveTemplate = useArchiveTemplate();
  const runNow = useRunRecurrences();
  const { confirm, confirmDialog } = useConfirm();

  const [ruleOpen, setRuleOpen] = useState(false);
  const [editing, setEditing] = useState<TaskRecurrence | undefined>();
  const [templateOpen, setTemplateOpen] = useState(false);

  async function drop(rule: TaskRecurrence) {
    const ok = await confirm({
      title: `Delete "${rule.title}"?`,
      description: 'Tasks it already filed stay where they are. Nothing new gets created.',
      confirmLabel: 'Delete rule',
      destructive: true,
    });
    if (ok) removeRule.mutate(rule.id);
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      {/* ── Recurring ────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Repeat className="size-4 text-primary-bold" aria-hidden />
            Recurring tasks
            {rules.length > 0 ? (
              <span className="tabular-nums text-muted-foreground">{rules.length}</span>
            ) : null}
          </h2>
          <div className="ml-auto flex items-center gap-2">
            {/* The hourly job already does this. The button is for the person
                who just made a rule and wants to see it work — waiting an hour
                to find out whether you filled the form in right is not a test. */}
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              disabled={runNow.isPending || rules.length === 0}
              leadingIcon={<RefreshCw className={cn('size-3.5', runNow.isPending && 'animate-spin motion-reduce:animate-none')} />}
              onClick={() => runNow.mutate()}
            >
              Run due rules
            </Button>
            <Button
              size="sm"
              className="text-xs"
              leadingIcon={<Plus className="size-3.5" />}
              onClick={() => { setEditing(undefined); setRuleOpen(true); }}
            >
              New rule
            </Button>
          </div>
        </div>

        {runNow.data ? (
          <p className="rounded-card border border-success bg-success-subtle px-3 py-2 text-xs text-success-subtle-foreground">
            {runNow.data.generated} filed
            {runNow.data.skipped > 0 ? ` · ${runNow.data.skipped} already existed` : ''}
          </p>
        ) : null}

        {rulesLoading ? (
          <Loading label="Loading rules…" />
        ) : rules.length === 0 ? (
          <Empty copy="No repeating tasks yet. “Review outstanding transporter balances every Monday” is the kind of thing that belongs here." />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface-raised">
            {rules.map((rule) => (
              <li key={rule.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                {/* Live or dormant, said in one glyph. A disabled rule is not
                    a failure — it is a job that comes back in January — so it
                    goes grey rather than red. */}
                <IconChip
                  icon={Repeat}
                  size={36}
                  tint={rule.enabled ? 'teal' : 'neutral'}
                  className="shrink-0"
                />

                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-sm font-bold', rule.enabled ? 'text-foreground' : 'text-muted-foreground')}>
                    {rule.title}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold',
                        rule.enabled
                          ? 'bg-primary-subtle text-primary-subtle-foreground'
                          : 'bg-surface-sunken text-muted-foreground',
                      )}
                    >
                      {describeRecurrence(rule)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="size-3" aria-hidden />
                      Next {formatDate(rule.nextRunOn)}
                    </span>
                    {rule.priority !== 'NORMAL' ? (
                      <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[0.6875rem] font-semibold">
                        {TASK_PRIORITY_LABEL[rule.priority]}
                      </span>
                    ) : null}
                    {rule._count ? (
                      <span className="tabular-nums">· {rule._count.occurrences} filed</span>
                    ) : null}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {rule.assignee ? (
                    <PersonAvatar person={rule.assignee} size="sm" />
                  ) : (
                    <span className="text-xs italic text-muted-foreground">Unassigned</span>
                  )}

                  {/* Disabling is the honest alternative to deleting: the rule
                      keeps its history and can come back in January. */}
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(event) => toggleRule.mutate({ id: rule.id, patch: { enabled: event.target.checked } })}
                      className="size-4 rounded-sm accent-[var(--primary)]"
                    />
                    On
                  </label>

                  <button
                    type="button"
                    aria-label={`Edit ${rule.title}`}
                    onClick={() => { setEditing(rule); setRuleOpen(true); }}
                    className="rounded-sm p-1.5 text-muted-foreground transition-colors duration-fast hover:bg-surface-sunken hover:text-foreground"
                  >
                    <Pencil className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${rule.title}`}
                    onClick={() => void drop(rule)}
                    className="rounded-sm p-1.5 text-muted-foreground transition-colors duration-fast hover:bg-surface-sunken hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Templates ────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <ListChecks className="size-4 text-primary-bold" aria-hidden />
            Templates
            {templates.length > 0 ? (
              <span className="tabular-nums text-muted-foreground">{templates.length}</span>
            ) : null}
          </h2>
          <Button
            size="sm"
            className="ml-auto text-xs"
            leadingIcon={<Plus className="size-3.5" />}
            onClick={() => setTemplateOpen(true)}
          >
            New template
          </Button>
        </div>

        {templatesLoading ? (
          <Loading label="Loading templates…" />
        ) : templates.length === 0 ? (
          <Empty copy="No templates yet. A template is a task with its steps already written — it appears on the Raise dialog." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((template) => (
              <article key={template.id} className="flex flex-col rounded-card border border-border bg-surface-raised p-4">
                <div className="flex items-start gap-2.5">
                  <IconChip icon={ListChecks} size={36} tint="blue" className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-bold text-foreground">{template.name}</h3>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{template.title}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Archive ${template.name}`}
                    onClick={() => archiveTemplate.mutate(template.id)}
                    className="shrink-0 rounded-sm p-1.5 text-muted-foreground transition-colors duration-fast hover:bg-surface-sunken hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>

                {template.items.length > 0 ? (
                  <ol className="mt-3 space-y-1 border-t border-border-subtle pt-3">
                    {template.items.slice(0, 4).map((item, index) => (
                      <li key={item.id} className="flex gap-2 text-xs text-foreground">
                        <span className="tabular-nums text-muted-foreground">{index + 1}.</span>
                        <span className="min-w-0 flex-1 truncate">{item.text}</span>
                      </li>
                    ))}
                    {template.items.length > 4 ? (
                      <li className="pl-5 text-xs text-muted-foreground">+{template.items.length - 4} more</li>
                    ) : null}
                  </ol>
                ) : null}

                <p className="mt-3 flex flex-wrap items-center gap-x-2 text-[0.6875rem] text-muted-foreground">
                  <span>{TASK_PRIORITY_LABEL[template.priority]}</span>
                  {template.dueInDays !== null && template.dueInDays !== undefined ? (
                    <>
                      <span aria-hidden>·</span>
                      <span>Due in {template.dueInDays}d</span>
                    </>
                  ) : null}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <RecurrenceDialog open={ruleOpen} onOpenChange={setRuleOpen} rule={editing} />
      <TemplateDialog open={templateOpen} onOpenChange={setTemplateOpen} />
      {confirmDialog}
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-card border border-border py-12 text-sm text-muted-foreground">
      <Spinner className="size-4" /> {label}
    </div>
  );
}

function Empty({ copy }: { copy: string }) {
  return (
    <p className="rounded-card border border-dashed border-border bg-surface-sunken px-4 py-8 text-center text-sm text-muted-foreground">
      {copy}
    </p>
  );
}

export default WorkspaceAutomationPage;
