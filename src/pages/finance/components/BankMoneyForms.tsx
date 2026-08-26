import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';

import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Landmark,
} from '@/design-system/icons';
import {
  Button,
  Input,
  Select,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Textarea,
} from '@/design-system';
import { formatMoneyMinorUnits, scaleForCurrency, toMinorUnits } from '@/lib/finance';
import type { BankAccountRecord, MovementMethod, RecordMovementPayload } from '@/features/bank-accounts';

import { BankLogo } from './BankLogo';

/**
 * The three ways the finance desk moves money by hand: cash in, cash out, and
 * between two accounts Fleetin owns. All three share one sheet shell because
 * they ask the same four questions — how much, by what method, when, and why —
 * and differ only in which balance the answer lands on.
 */

const METHOD_OPTIONS: { value: MovementMethod; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'MOBILE_MONEY', label: 'Mobile money' },
];

const today = () => new Date().toISOString().slice(0, 10);

interface MoneyFormState {
  amount: string;
  method: MovementMethod;
  externalReference: string;
  description: string;
  occurredAt: string;
}

const EMPTY_MONEY_FORM: MoneyFormState = {
  amount: '',
  method: 'CASH',
  externalReference: '',
  description: '',
  occurredAt: today(),
};

/** Shared shell — header, scrollable body, sticky footer. */
function MoneySheet({
  open,
  onOpenChange,
  title,
  icon,
  description,
  onSubmit,
  submitLabel,
  pending,
  error,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  icon: ReactNode;
  description: string;
  onSubmit: (event: FormEvent) => void;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 overflow-hidden border-l border-border bg-background p-0 sm:max-w-md"
      >
        <div className="shrink-0 space-y-1 border-b border-border/40 px-6 pb-4 pt-6 sm:px-8 sm:pt-8">
          <SheetTitle className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-foreground">
            {icon} {title}
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">{description}</SheetDescription>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 sm:px-8">
            <div className="space-y-4">{children}</div>
          </div>

          {error ? (
            <p className="shrink-0 border-t border-destructive/30 bg-destructive-subtle px-6 py-3 text-xs font-bold text-destructive-subtle-foreground sm:px-8">
              {error}
            </p>
          ) : null}

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/40 bg-background px-6 py-4 sm:px-8">
            <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={pending}
              className="rounded-lg bg-primary px-5 font-semibold text-primary-foreground"
            >
              {pending ? 'Working…' : submitLabel}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** The account this money is landing on or leaving, restated so it can't be mistaken. */
function AccountBanner({ account, caption }: { account: BankAccountRecord; caption: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-sunken/50 p-3">
      <BankLogo logoUrl={account.logoUrl} name={account.bankName} size={36} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-bold text-foreground">{account.bankName}</span>
        <span className="truncate text-[11px] font-semibold text-muted-foreground">
          {caption} · {formatMoneyMinorUnits(account.currentBalance, account.currency)}
        </span>
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-bold text-foreground">{label}</label>
      {children}
    </div>
  );
}

/** Amount / method / date / reference / note — identical on all three forms. */
function MoneyFields({
  form,
  setForm,
  currency,
  amountLabel = 'Amount',
}: {
  form: MoneyFormState;
  setForm: (next: MoneyFormState) => void;
  currency: string;
  amountLabel?: string;
}) {
  const step = scaleForCurrency(currency) === 0 ? '1' : '0.01';

  return (
    <>
      <Field label={`${amountLabel} (${currency}) *`}>
        <Input
          required
          type="number"
          min="0"
          step={step}
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          placeholder="0"
          className="font-mono text-base font-bold tabular-nums"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Method">
          <Select
            value={form.method}
            options={METHOD_OPTIONS}
            onChange={(e) => setForm({ ...form, method: e.target.value as MovementMethod })}
          />
        </Field>
        <Field label="Date">
          <Input
            type="date"
            value={form.occurredAt}
            onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
          />
        </Field>
      </div>

      <Field label="Bank / teller reference">
        <Input
          value={form.externalReference}
          onChange={(e) => setForm({ ...form, externalReference: e.target.value })}
          placeholder="Optional"
        />
      </Field>

      <Field label="Note">
        <Textarea
          rows={3}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="What this movement was for"
        />
      </Field>
    </>
  );
}

/**
 * A `<input type="date">` gives a day, not a moment. Backdating to a past day
 * gets that day's local midnight; picking today means *now*, so several
 * movements entered the same afternoon still list in the order they happened
 * instead of collapsing onto one midnight timestamp.
 */
function occurredAtFrom(date: string): string | undefined {
  if (!date) return undefined;
  if (date === today()) return new Date().toISOString();
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toISOString();
}

function payloadFrom(form: MoneyFormState, currency: string): RecordMovementPayload {
  return {
    amountMinorUnits: toMinorUnits(Number(form.amount), currency),
    method: form.method,
    externalReference: form.externalReference || undefined,
    description: form.description || undefined,
    occurredAt: occurredAtFrom(form.occurredAt),
  };
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/* ─── Deposit / withdraw ──────────────────────────────────────────────── */

export function MovementSheet({
  account,
  mode,
  open,
  onOpenChange,
  onSubmit,
  pending,
}: {
  account: BankAccountRecord | null;
  mode: 'deposit' | 'withdraw';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: RecordMovementPayload) => Promise<unknown>;
  pending: boolean;
}) {
  const [form, setForm] = useState<MoneyFormState>(EMPTY_MONEY_FORM);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_MONEY_FORM, occurredAt: today() });
      setError(null);
    }
  }, [open, account?.id, mode]);

  if (!account) return null;

  const isDeposit = mode === 'deposit';
  const amount = Number(form.amount);
  const balance = Number(account.currentBalance);
  const requested = Number.isFinite(amount) ? toMinorUnits(amount, account.currency) : 0;
  const overdrawn = !isDeposit && requested > balance;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (overdrawn) {
      setError(
        `${account.bankName} only holds ${formatMoneyMinorUnits(account.currentBalance, account.currency)}.`,
      );
      return;
    }
    try {
      await onSubmit(payloadFrom(form, account.currency));
      onOpenChange(false);
    } catch (submitError) {
      setError(messageOf(submitError, 'The movement could not be recorded.'));
    }
  };

  return (
    <MoneySheet
      open={open}
      onOpenChange={onOpenChange}
      title={isDeposit ? 'Record a Deposit' : 'Record a Withdrawal'}
      icon={
        isDeposit ? (
          <ArrowDownLeft className="h-5 w-5 text-primary" />
        ) : (
          <ArrowUpRight className="h-5 w-5 text-accent" />
        )
      }
      description={
        isDeposit
          ? 'Money arriving into this account from outside Fleetin. The balance moves the moment this is saved, and the movement stays on the account as its explanation.'
          : 'Money leaving this account. Refused if it would take the balance below zero — an account can never pay out more than it holds.'
      }
      onSubmit={handleSubmit}
      submitLabel={isDeposit ? 'Record Deposit' : 'Record Withdrawal'}
      pending={pending}
      error={error}
    >
      <AccountBanner account={account} caption={isDeposit ? 'Balance before' : 'Available'} />
      <MoneyFields form={form} setForm={setForm} currency={account.currency} />
      {form.amount && Number.isFinite(amount) && amount > 0 ? (
        overdrawn ? (
          // Never preview a negative balance — the account cannot reach one, so
          // showing the shortfall is the honest version of the same arithmetic.
          <p className="rounded-lg bg-warning-subtle px-3 py-2.5 text-xs font-semibold text-warning-subtle-foreground">
            Short by{' '}
            <span className="font-mono font-bold tabular-nums">
              {formatMoneyMinorUnits(requested - balance, account.currency)}
            </span>{' '}
            — this account holds {formatMoneyMinorUnits(account.currentBalance, account.currency)}.
          </p>
        ) : (
          <p className="rounded-lg bg-surface-sunken px-3 py-2.5 text-xs font-semibold text-muted-foreground">
            Balance after ·{' '}
            <span className="font-mono font-bold tabular-nums text-foreground">
              {formatMoneyMinorUnits(isDeposit ? balance + requested : balance - requested, account.currency)}
            </span>
          </p>
        )
      ) : null}
    </MoneySheet>
  );
}

/* ─── Transfer ────────────────────────────────────────────────────────── */

export function TransferSheet({
  accounts,
  fromAccountId,
  open,
  onOpenChange,
  onSubmit,
  pending,
}: {
  accounts: BankAccountRecord[];
  fromAccountId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (fromId: string, payload: RecordMovementPayload & {
    toBankAccountId: string;
    receivedAmountMinorUnits?: number;
  }) => Promise<unknown>;
  pending: boolean;
}) {
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [received, setReceived] = useState('');
  const [form, setForm] = useState<MoneyFormState>({ ...EMPTY_MONEY_FORM, method: 'BANK_TRANSFER' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const initialFrom = fromAccountId ?? accounts[0]?.id ?? '';
    setFromId(initialFrom);
    setToId(accounts.find((account) => account.id !== initialFrom)?.id ?? '');
    setForm({ ...EMPTY_MONEY_FORM, method: 'BANK_TRANSFER', occurredAt: today() });
    setReceived('');
    setError(null);
  }, [open, fromAccountId, accounts]);

  const from = useMemo(() => accounts.find((account) => account.id === fromId) ?? null, [accounts, fromId]);
  const to = useMemo(() => accounts.find((account) => account.id === toId) ?? null, [accounts, toId]);
  const crossCurrency = Boolean(from && to && from.currency !== to.currency);

  const amount = Number(form.amount);
  const sentMinor = from && Number.isFinite(amount) ? toMinorUnits(amount, from.currency) : 0;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!from || !to) {
      setError('Pick both a source and a destination account.');
      return;
    }
    if (from.id === to.id) {
      setError('Source and destination must be different accounts.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (sentMinor > Number(from.currentBalance)) {
      setError(`${from.bankName} only holds ${formatMoneyMinorUnits(from.currentBalance, from.currency)}.`);
      return;
    }
    if (crossCurrency && !(Number(received) > 0)) {
      setError(`State the amount landing in ${to.currency} — the rate is not guessed here.`);
      return;
    }

    try {
      await onSubmit(from.id, {
        ...payloadFrom(form, from.currency),
        toBankAccountId: to.id,
        receivedAmountMinorUnits: crossCurrency ? toMinorUnits(Number(received), to.currency) : undefined,
      });
      onOpenChange(false);
    } catch (submitError) {
      setError(messageOf(submitError, 'The transfer could not be completed.'));
    }
  };

  const accountOptions = (exclude?: string) =>
    accounts
      .filter((account) => account.id !== exclude)
      .map((account) => ({
        value: account.id,
        label: `${account.bankName} · ••${account.accountNumber.slice(-4)} (${account.currency})`,
      }));

  return (
    <MoneySheet
      open={open}
      onOpenChange={onOpenChange}
      title="Transfer Between Accounts"
      icon={<ArrowLeftRight className="h-5 w-5 text-primary" />}
      description="Between two Fleetin accounts. Both legs post together or neither does."
      onSubmit={handleSubmit}
      submitLabel="Transfer Funds"
      pending={pending}
      error={error}
    >
      <Field label="From *">
        <Select
          value={fromId}
          options={accountOptions(toId)}
          onChange={(e) => setFromId(e.target.value)}
          leadingIcon={<Landmark className="size-4" />}
        />
      </Field>
      {from ? (
        <p className="-mt-2 text-[11px] font-semibold text-muted-foreground">
          Holds{' '}
          <span className="font-mono font-bold tabular-nums text-foreground">
            {formatMoneyMinorUnits(from.currentBalance, from.currency)}
          </span>
        </p>
      ) : null}

      <Field label="To *">
        <Select
          value={toId}
          options={accountOptions(fromId)}
          onChange={(e) => setToId(e.target.value)}
          leadingIcon={<Landmark className="size-4" />}
        />
      </Field>

      <MoneyFields
        form={form}
        setForm={setForm}
        currency={from?.currency ?? 'DJF'}
        amountLabel={crossCurrency ? 'Amount sent' : 'Amount'}
      />

      {crossCurrency && to ? (
        <Field label={`Amount received (${to.currency}) *`}>
          <Input
            required
            type="number"
            min="0"
            step={scaleForCurrency(to.currency) === 0 ? '1' : '0.01'}
            value={received}
            onChange={(e) => setReceived(e.target.value)}
            placeholder="0"
            className="font-mono text-base font-bold tabular-nums"
          />
          <p className="pt-1 text-[11px] font-semibold text-muted-foreground">
            The two accounts hold different currencies — state what actually lands rather than letting a rate be
            assumed.
          </p>
        </Field>
      ) : null}

      {from && to && sentMinor > 0 ? (
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface-sunken px-3 py-2.5 text-xs font-semibold text-muted-foreground">
          <span className="flex flex-col gap-0.5">
            {from.bankName} after
            <span className="font-mono font-bold tabular-nums text-foreground">
              {formatMoneyMinorUnits(Number(from.currentBalance) - sentMinor, from.currency)}
            </span>
          </span>
          <span className="flex flex-col gap-0.5">
            {to.bankName} after
            <span className="font-mono font-bold tabular-nums text-foreground">
              {formatMoneyMinorUnits(
                Number(to.currentBalance) +
                  (crossCurrency ? toMinorUnits(Number(received) || 0, to.currency) : sentMinor),
                to.currency,
              )}
            </span>
          </span>
        </div>
      ) : null}
    </MoneySheet>
  );
}
