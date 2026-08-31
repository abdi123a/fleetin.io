import { useEffect, useRef, useState } from 'react';

import {
  Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Input, Select, Textarea,
} from '@/design-system';
import { Plus, X } from '@/design-system/icons';

import { useCreateTemplate } from '../api/queries';
import { TASK_PRIORITIES, TASK_PRIORITY_LABEL, type TaskPriority } from '../contracts';

export interface TemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * A named task with its steps already written.
 *
 * Kept thin on purpose — the plan calls templates the weakest item in Phase 3,
 * and for a desk of eight a template is a checklist somebody copies once a
 * month, not a builder with conditions. Name, title, priority, a due offset
 * and the steps. No default assignee: the person who should do it depends on
 * the job it lands on, and a wrong default is worse than none.
 */
export function TemplateDialog({ open, onOpenChange }: TemplateDialogProps) {
  const create = useCreateTemplate();

  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('NORMAL');
  const [dueInDays, setDueInDays] = useState('');
  /* `{key, text}` rather than a bare string: these rows are inserted and
     removed mid-list, and an index key made React reuse the wrong input. */
  const [items, setItems] = useState<{ key: number; text: string }[]>([{ key: 0, text: '' }]);
  const nextKey = useRef(1);

  useEffect(() => {
    if (open) return;
    setName(''); setTitle(''); setDescription(''); setPriority('NORMAL'); setDueInDays(''); setItems([{ key: 0, text: '' }]);
  }, [open]);

  const steps = items.map((item) => item.text.trim()).filter(Boolean);

  function submit() {
    if (!name.trim() || !title.trim()) return;
    create.mutate(
      {
        name: name.trim(),
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        dueInDays: dueInDays ? Number(dueInDays) : undefined,
        items: steps.map((text) => ({ text })),
      },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader title="New template" />

        <DialogBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">Template name</span>
              <Input
                value={name}
                autoFocus
                placeholder="Onboard a transporter"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">Task title</span>
              <Input
                value={title}
                placeholder="Onboard new transporter"
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-foreground">Notes</span>
            <Textarea
              rows={2}
              value={description}
              placeholder="What the person picking this up needs to know"
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">Priority</span>
              <Select
                value={priority}
                onChange={(event) => setPriority(event.target.value as TaskPriority)}
                options={TASK_PRIORITIES.map((p) => ({ value: p, label: TASK_PRIORITY_LABEL[p] }))}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">Due in (days)</span>
              <Input
                type="number"
                min={0}
                max={365}
                value={dueInDays}
                placeholder="No date"
                onChange={(event) => setDueInDays(event.target.value)}
              />
            </label>
          </div>

          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-foreground">
              Steps {steps.length > 0 ? <span className="text-muted-foreground">· {steps.length}</span> : null}
            </span>
            {items.map((item, index) => (
              <div key={item.key} className="flex items-center gap-1.5">
                <Input
                  value={item.text}
                  placeholder={index === 0 ? 'Contact partner' : 'Next step'}
                  onChange={(event) =>
                    setItems((current) =>
                      current.map((row) => (row.key === item.key ? { ...row, text: event.target.value } : row)),
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    const key = nextKey.current++;
                    setItems((current) => [
                      ...current.slice(0, index + 1),
                      { key, text: '' },
                      ...current.slice(index + 1),
                    ]);
                  }}
                />
                <button
                  type="button"
                  aria-label={`Remove step ${index + 1}`}
                  onClick={() =>
                    setItems((current) =>
                      current.length === 1 ? [{ key: nextKey.current++, text: '' }] : current.filter((row) => row.key !== item.key),
                    )
                  }
                  className="shrink-0 rounded-sm p-1.5 text-muted-foreground transition-colors duration-fast hover:bg-surface-sunken hover:text-destructive"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              leadingIcon={<Plus className="size-3.5" />}
              onClick={() => setItems((current) => [...current, { key: nextKey.current++, text: '' }])}
            >
              Add step
            </Button>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending || !name.trim() || !title.trim()}>
            Create template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
