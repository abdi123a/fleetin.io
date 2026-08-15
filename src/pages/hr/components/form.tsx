import { useEffect, type ReactNode } from 'react';

import { IconChip } from '@/design-system';
import { X } from '@/design-system/icons';
import { cn } from '@/utils';

/**
 * The HR module's form furniture.
 *
 * Deliberately thin: everything visual — panels, pills, tables, buttons —
 * already comes from the finance kit, which is the app's shared vocabulary.
 * What is missing there is the labelled input and the modal frame, so only
 * those live here, and they use the same tokens as everything else.
 */

export const inputClass =
  'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground outline-none transition-colors placeholder:font-medium placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring disabled:opacity-45';

/** Label above, control below, one optional line of help under it. */
export function Field({
  label,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="text-xs font-bold text-foreground">
        {label}
        {required ? <span className="ml-0.5 text-accent-subtle-foreground">*</span> : null}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint ? (
        <span className="mt-1.5 block text-[11px] font-semibold leading-snug text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

/** Two columns from `sm` up; one below it. The form grid used by every HR modal. */
export function FieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</div>;
}

/**
 * The module's modal frame. Escape and the backdrop both close it, and the
 * committing action lives in the footer rather than floating in the body.
 */
export function ModalShell({
  open,
  onClose,
  icon,
  tint = 'teal',
  title,
  subtitle,
  size = 'md',
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  icon: Parameters<typeof IconChip>[0]['icon'];
  tint?: Parameters<typeof IconChip>[0]['tint'];
  title: string;
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg';
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
          size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-3xl' : 'max-w-xl',
        )}
      >
        <div className="flex items-start gap-3 border-b border-border-subtle px-5 py-4">
          <IconChip icon={icon} tint={tint} size={36} />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-extrabold tracking-tight text-foreground">{title}</h2>
            {subtitle ? (
              <p className="mt-0.5 text-xs font-semibold text-muted-foreground">{subtitle}</p>
            ) : null}
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

/** A server refusal, said in the user's words rather than swallowed. */
export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return (
    <p className="rounded-lg border border-destructive-subtle bg-destructive-subtle px-3 py-2 text-xs font-bold text-destructive-subtle-foreground">
      {message}
    </p>
  );
}
