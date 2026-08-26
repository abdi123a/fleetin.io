import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { IconChip } from '@/design-system';
import { Check, X } from '@/design-system/icons';
import { cn } from '@/utils';

/**
 * The HR module's form furniture.
 *
 * Deliberately thin: everything visual — panels, pills, tables, buttons —
 * already comes from the finance kit, which is the app's shared vocabulary.
 * What is missing there is the labelled input, the modal frame and the step
 * rail, so only those live here, and they use the same tokens as everything
 * else.
 */

export const inputClass =
  'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground outline-none transition-colors placeholder:font-medium placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring disabled:opacity-45';

/** Label above, control below, one optional line of help under it. */
export function Field({
  label,
  hint,
  required,
  error,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  required?: boolean;
  /** Said instead of the hint, because a refusal outranks an explanation. */
  error?: string;
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
      {error ? (
        <span className="mt-1.5 block text-[11px] font-bold leading-snug text-destructive-subtle-foreground">
          {error}
        </span>
      ) : hint ? (
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

/* ═══════════════════════════════════════════════════════════════════════════
 * Step rail
 * ═══════════════════════════════════════════════════════════════════════ */

export interface WizardStep {
  key: string;
  /** The full name of the step, used as the body heading. */
  title: string;
  /** What this step is for, one line, under the heading. */
  description: string;
  /** The rail is narrow — under each dot goes the short name. */
  short: string;
}

/**
 * The numbered rail a multi-step modal is navigated by.
 *
 * Matches the shipment wizard's rail rather than inventing a second one: a
 * completed step is a tick, the current step is ringed, and a step ahead of
 * the furthest one reached is not clickable — going forward has to pass the
 * validation the Next button runs.
 *
 * Below `sm` the labels are dropped and only the dots and the rule remain,
 * because six words per dot on a 360px screen wrap into an unreadable stack.
 */
export function StepRail({
  steps,
  current,
  furthest,
  onStepChange,
  className,
}: {
  steps: readonly WizardStep[];
  current: number;
  /** The highest step reached so far — everything up to it is revisitable. */
  furthest: number;
  onStepChange: (index: number) => void;
  className?: string;
}) {
  return (
    <ol className={cn('flex items-start', className)}>
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        const reachable = index <= furthest;
        const last = index === steps.length - 1;

        return (
          <li key={step.key} className={cn('flex items-start', !last && 'flex-1')}>
            <button
              type="button"
              disabled={!reachable}
              aria-current={active ? 'step' : undefined}
              onClick={() => reachable && onStepChange(index)}
              className={cn(
                'flex shrink-0 flex-col items-center gap-1.5 rounded-lg px-1 pb-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                reachable ? 'cursor-pointer' : 'cursor-not-allowed',
              )}
            >
              <span
                className={cn(
                  'flex size-8 items-center justify-center rounded-full text-xs font-extrabold transition-all',
                  active
                    ? 'bg-primary-bold text-primary-bold-foreground ring-4 ring-primary-subtle'
                    : done
                      ? 'bg-primary-bold text-primary-bold-foreground'
                      : 'border-2 border-border bg-surface-sunken text-muted-foreground',
                )}
              >
                {done ? <Check aria-hidden className="size-4 stroke-[3]" /> : index + 1}
              </span>
              <span
                className={cn(
                  'hidden whitespace-nowrap text-[11px] font-bold leading-none sm:block',
                  active || done ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {step.short}
              </span>
            </button>
            {last ? null : (
              <span
                aria-hidden
                className={cn(
                  'mx-1.5 mt-4 h-0.5 flex-1 rounded-full transition-colors sm:mx-2.5',
                  done ? 'bg-primary-bold' : 'bg-border',
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Modal
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * The module's modal frame. Escape and the backdrop both close it, and the
 * committing action lives in the footer rather than floating in the body.
 *
 * Portalled to `document.body` and layered with `z-modal`, both of which are
 * load-bearing. It used to render in place at a raw `z-50`, which is *below*
 * `z-sidebar` (200) and `z-header` (300) — so every HR dialog opened behind
 * the navigation and had its left-hand column of fields covered by it. A
 * dialog is the topmost thing on screen or it is broken, so it uses the named
 * step of the app's z-scale and escapes any ancestor stacking context.
 */
export function ModalShell({
  open,
  onClose,
  icon,
  tint = 'teal',
  title,
  subtitle,
  size = 'md',
  toolbar,
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
  /** Sits under the title, above the scroll area — the step rail goes here. */
  toolbar?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);

    /* The page behind a dialog must not scroll under it — on a phone the
       backdrop is the whole viewport and a stray swipe scrolls the list the
       user is trying to add to. */
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  /* Focus lands inside the dialog rather than staying on whatever opened it,
     so the first Tab moves through the form and Escape is already in scope. */
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-modal flex items-end justify-center bg-overlay/70 backdrop-blur-[2px] sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-card border border-border bg-card shadow-2xl outline-none sm:max-h-[88vh] sm:rounded-card',
          size === 'sm' ? 'sm:max-w-sm' : size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-xl',
        )}
      >
        <div className="shrink-0 border-b border-border-subtle px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            <IconChip icon={icon} tint={tint} size={36} />
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-extrabold tracking-tight text-foreground">{title}</h2>
              {subtitle ? (
                <p className="mt-0.5 text-xs font-semibold leading-snug text-muted-foreground">
                  {subtitle}
                </p>
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
          {toolbar ? <div className="mt-4">{toolbar}</div> : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {children}
        </div>

        {/* Stacks below `sm` so a two-button footer does not squeeze both
            labels onto one illegible line on a phone. */}
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border-subtle bg-surface-sunken px-4 py-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:px-5">
          {footer}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Why a panel is empty, when it is empty because the server said no.
 *
 * Every HR read defaults to `[]` on failure, so a refused request and an
 * empty table used to look identical — "No documents issued yet" is a lie
 * when the truth is a 403, and it is the reason a missing permission on a
 * deployed role reads as a feature that was never built. A refusal is named
 * as one, and the status is shown because it is the first thing anyone needs
 * in order to fix it.
 */
export function LoadError({ error, noun }: { error: unknown; noun: string }) {
  if (!error) return null;

  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status: unknown }).status)
      : undefined;
  const message = error instanceof Error ? error.message : String(error);

  /*
   * Only a 403 is diagnosed here. Every other status gets a neutral headline
   * and lets the server's own sentence do the explaining — a 404 from this
   * API is as often a missing *row* ("no payroll configuration is in force")
   * as a missing route, and guessing between them puts a confident wrong
   * answer above the correct one the server already sent.
   */
  const headline =
    status === 403
      ? `This role is not allowed to read ${noun}.`
      : `${noun.charAt(0).toUpperCase()}${noun.slice(1)} could not be loaded.`;

  return (
    <div className="mx-5 mb-5 rounded-card border border-destructive-subtle bg-destructive-subtle px-4 py-3">
      <p className="text-sm font-extrabold text-destructive-subtle-foreground">{headline}</p>
      <p className="mt-1 text-xs font-semibold leading-snug text-destructive-subtle-foreground">
        {status ? `HTTP ${status} — ` : ''}
        {message}
      </p>
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
