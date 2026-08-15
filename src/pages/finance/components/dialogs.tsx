import { useEffect, useState, type ReactNode } from 'react';

import { IconChip } from '@/design-system';
import { FolderOpen, X } from '@/design-system/icons';
import { cn } from '@/utils';

import { ActionButton } from './kit';

/* ═══════════════════════════════════════════════════════════════════════════
 * Shell
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * The module's one modal frame. Escape closes, the backdrop closes, and the
 * footer is where the committing action lives — never floating in the body.
 */
function ModalShell({
  open,
  onClose,
  icon,
  tint,
  title,
  subtitle,
  size = 'md',
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  icon: Parameters<typeof IconChip>[0]['icon'];
  tint: Parameters<typeof IconChip>[0]['tint'];
  title: string;
  subtitle: string;
  /** `sm` is for quick-glance popups — status only, nothing to act on. */
  size?: 'md' | 'sm';
  children: ReactNode;
  footer: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-card border border-border bg-card shadow-2xl',
          size === 'sm' ? 'max-w-sm' : 'max-w-xl',
        )}
      >
        <div className="flex items-start gap-3 border-b border-border-subtle px-5 py-4">
          <IconChip icon={icon} tint={tint} size={36} />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-extrabold tracking-tight text-foreground">{title}</h2>
            <p className="mt-0.5 text-xs font-semibold text-muted-foreground">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-surface-sunken hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-subtle bg-surface-sunken px-5 py-3.5">
          {footer}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Add project
 * ═══════════════════════════════════════════════════════════════════════ */

const textInputClass =
  'mt-1.5 w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm font-semibold text-foreground outline-none transition-colors placeholder:font-medium placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring';

const dateInputClass =
  'mt-1.5 w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm font-semibold text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** "≈ 6 months" / "18 days" — the plain-language read of a date span. Null for a non-span. */
function formatDuration(startIso: string, endIso: string): string | null {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  const days = Math.round((end - start) / (24 * 60 * 60 * 1000));
  if (days < 60) return `${days} day${days === 1 ? '' : 's'}`;
  const months = Math.round(days / 30);
  return `≈ ${months} month${months === 1 ? '' : 's'}`;
}

/**
 * A new body of work for a client — the contract's dates are captured here,
 * not bolted on afterwards, because they are what drives the closing
 * reminder and the final invoice once the work ends. No funding-source
 * picker: no per-project funding assignment exists in the real model.
 */
export function AddProjectDialog({
  open,
  onClose,
  clientName,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  clientName: string;
  onCreate: (input: { name: string; startedAt: string; contractEndAt?: string; monthlyEstimate?: number }) => void;
}) {
  const [name, setName] = useState('');
  const [startedAt, setStartedAt] = useState(todayIso());
  const [contractEndAt, setContractEndAt] = useState('');
  const [monthlyEstimate, setMonthlyEstimate] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('');
    setStartedAt(todayIso());
    setContractEndAt('');
    setMonthlyEstimate('');
  }, [open]);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && startedAt.length > 0;
  const duration = contractEndAt ? formatDuration(startedAt, contractEndAt) : null;
  const parsedEstimate = Number(monthlyEstimate);
  const estimateValue =
    monthlyEstimate.trim() !== '' && Number.isFinite(parsedEstimate) && parsedEstimate >= 0 ? parsedEstimate : null;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      icon={FolderOpen}
      tint="teal"
      title="New project"
      subtitle={`A body of work for ${clientName}`}
      footer={
        <>
          <ActionButton variant="ghost" onClick={onClose}>
            Cancel
          </ActionButton>
          <ActionButton
            variant="primary"
            icon={FolderOpen}
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return;
              onCreate({
                name: trimmedName,
                startedAt: new Date(startedAt).toISOString(),
                contractEndAt: contractEndAt ? new Date(contractEndAt).toISOString() : undefined,
                monthlyEstimate: estimateValue ?? undefined,
              });
              onClose();
            }}
          >
            Create project
          </ActionButton>
        </>
      }
    >
      <label className="block">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Project name
        </span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Q4 electronics corridor"
          className={textInputClass}
        />
      </label>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Start date
          </span>
          <input
            type="date"
            value={startedAt}
            onChange={(event) => setStartedAt(event.target.value)}
            className={dateInputClass}
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Contract ends <span className="normal-case text-muted-foreground/70">(optional)</span>
          </span>
          <input
            type="date"
            value={contractEndAt}
            min={startedAt || undefined}
            onChange={(event) => setContractEndAt(event.target.value)}
            className={dateInputClass}
          />
        </label>
      </div>
      <p className="mt-1.5 text-xs font-semibold text-muted-foreground">
        {duration
          ? `Contract duration: ${duration}. A reminder appears here once the end date reaches this month.`
          : 'No end date — treated as open-ended work, not a fixed-term contract.'}
      </p>

      <label className="mt-4 block">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Estimate for this month <span className="normal-case text-muted-foreground/70">(optional, DJF)</span>
        </span>
        <input
          type="number"
          min={0}
          value={monthlyEstimate}
          onChange={(event) => setMonthlyEstimate(event.target.value)}
          placeholder="e.g. 120000000"
          className={textInputClass}
        />
      </label>
      {/* Said plainly because the number invites the opposite assumption: an
          estimate here has no effect on whether work can run. */}
      <p className="mt-1.5 text-xs font-semibold text-muted-foreground">
        Planning figure only. It never caps or blocks anything — shipments keep running past it, and the real total
        for the month is whatever actually shipped.
      </p>
    </ModalShell>
  );
}
