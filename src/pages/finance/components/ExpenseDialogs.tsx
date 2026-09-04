import { useEffect, useState } from 'react';

import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  IconChip,
  Input,
  Label,
  Select,
} from '@/design-system';
import { FileText, Upload, X } from '@/design-system/icons';
import {
  useCreateExpense,
  useCreateRecurringExpense,
  type ExpenseCategory,
  type ExpenseFrequency,
} from '@/features/finance';
import { fmtDjf } from '@/lib/finance';
import { cn } from '@/utils';

import { EXPENSE_CATEGORY_OPTIONS, EXPENSE_FREQUENCY_OPTIONS } from '../expenseCatalog';

/**
 * The two ways a cost gets into the book — and they are kept apart on purpose.
 *
 * A **one-off expense** is money that has already gone: somebody bought
 * diesel, has the receipt, files it. Anyone who logs in fills this one in, so
 * it asks the five things a person standing at a pump can answer from the
 * paper in their hand — what it was, how much, when, and the receipt. Nothing
 * else. Every field that is not one of those is a field that makes somebody
 * put the phone away and file it later, which is to say never.
 *
 * A **recurring cost** is money that has NOT gone yet: the rent, a salary,
 * the insurance premium. It is a commitment, not a payment, so it asks for a
 * rhythm and a date instead of a receipt — and it lives behind its own button
 * on its own tab, because the one thing worse than a slow form is filing this
 * month's rent as though it were a taxi fare.
 */

const today = () => new Date().toISOString().slice(0, 10);

/** "1 200" / "1,200" typed by hand → 1200. */
const digitsOf = (value: string) => Number(value.replace(/[^\d]/g, '')) || 0;

const CATEGORY_OPTIONS = EXPENSE_CATEGORY_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
}));

/* ═══════════════════════════════════════════════════════════════════════════
 * A one-off expense
 * ═══════════════════════════════════════════════════════════════════════ */

export function AddExpenseDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (reference: string) => void;
}) {
  const [category, setCategory] = useState<ExpenseCategory | ''>('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [incurredAt, setIncurredAt] = useState(today);
  const [receipt, setReceipt] = useState<File | null>(null);
  const create = useCreateExpense();

  /* Re-seeded on every open rather than only at mount: "today" is wrong for a
     dialog opened at 23:58 and used at 00:02, or one left mounted overnight. */
  useEffect(() => {
    if (!open) return;
    setCategory('');
    setDescription('');
    setAmount('');
    setIncurredAt(today());
    setReceipt(null);
    create.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const value = digitsOf(amount);
  const ready =
    category !== '' && description.trim().length > 0 && value > 0 && Boolean(incurredAt) && receipt !== null;

  function submit() {
    if (!ready || !receipt) return;
    create.mutate(
      {
        category: category as ExpenseCategory,
        description: description.trim(),
        amount: value,
        incurredAt,
        receipt,
      },
      {
        onSuccess: (expense) => {
          onOpenChange(false);
          onCreated?.(expense.number);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden p-0 sm:max-w-md">
        <DialogHeader title="Add expense" className="shrink-0">
          <p className="text-sm text-muted-foreground">
            Money you spent. An admin approves it, then it is paid.
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
          {/* The receipt leads, because it is the thing the claimant is
              holding and the one field the server refuses the form without.
              Asking for it last is how a filled-in form gets abandoned at the
              point somebody has to go and find the paper. */}
          <ReceiptField file={receipt} onChange={setReceipt} />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-description">What it was for</Label>
            <Input
              id="expense-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Diesel for the Doraleh run"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expense-category">Kind</Label>
              <Select
                id="expense-category"
                value={category}
                onChange={(event) => setCategory(event.target.value as ExpenseCategory)}
                placeholder="Choose"
                options={CATEGORY_OPTIONS}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expense-amount">Amount (DJF)</Label>
              <Input
                id="expense-amount"
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0"
                className="tabular-nums"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>When</Label>
            <DatePicker
              value={incurredAt}
              onChange={setIncurredAt}
              placeholder="The date on the receipt"
            />
          </div>
        </div>

        {create.isError ? (
          <p className="shrink-0 px-5 pb-2 text-sm text-destructive sm:px-6">
            {(create.error as Error).message}
          </p>
        ) : null}

        <DialogFooter className="shrink-0 border-t border-border-subtle">
          {/* The figure repeated where it is committed to — the amount field
              may have scrolled out of sight by now. */}
          <span className="mr-auto text-sm text-muted-foreground">
            {value > 0 ? (
              <span className="font-semibold tabular-nums text-foreground">{fmtDjf(value)}</span>
            ) : (
              'No amount yet'
            )}
          </span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!ready || create.isPending} onClick={submit}>
            {create.isPending ? 'Sending…' : 'Send for approval'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The receipt — one file, required.
 *
 * One, unlike `ProofFileField`'s many: a proof of delivery is a bundle of
 * pages, an expense is a single till slip or invoice. Somebody with two pieces
 * of paper for one purchase has two expenses, or one photograph of both.
 */
function ReceiptField({ file, onChange }: { file: File | null; onChange: (file: File | null) => void }) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3.5 py-3 transition-colors',
        file
          ? 'border-success/50 bg-success-subtle/40'
          : 'border-primary/40 bg-primary/5 hover:bg-primary/10',
      )}
    >
      <input
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,image/*"
        className="hidden"
        onChange={(event) => {
          const chosen = event.target.files?.[0] ?? null;
          if (chosen) onChange(chosen);
          event.target.value = '';
        }}
      />
      <IconChip icon={file ? FileText : Upload} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-bold text-foreground">
          {file ? file.name : 'Attach the receipt'}
        </span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">
          {file ? `${(file.size / 1024).toFixed(0)} KB` : 'Photograph or PDF · required'}
        </span>
      </span>
      {file ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            onChange(null);
          }}
          className="-m-1 shrink-0 rounded-sm p-1 text-muted-foreground transition-colors hover:text-destructive"
          aria-label={`Remove ${file.name}`}
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </label>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * A recurring cost
 * ═══════════════════════════════════════════════════════════════════════ */

/** What one occurrence costs per month — the frontend half of `monthlyEquivalent`. */
function monthlyOf(amount: number, frequency: ExpenseFrequency): number {
  switch (frequency) {
    case 'WEEKLY':
      return (amount * 52) / 12;
    case 'MONTHLY':
      return amount;
    case 'QUARTERLY':
      return amount / 3;
    case 'ANNUAL':
      return amount / 12;
  }
}

export function AddRecurringExpenseDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [description, setDescription] = useState('');
  const [payee, setPayee] = useState('');
  const [category, setCategory] = useState<ExpenseCategory | ''>('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<ExpenseFrequency>('MONTHLY');
  const [nextDueAt, setNextDueAt] = useState(today);
  const create = useCreateRecurringExpense();

  useEffect(() => {
    if (!open) return;
    setDescription('');
    setPayee('');
    setCategory('');
    setAmount('');
    setFrequency('MONTHLY');
    setNextDueAt(today());
    create.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const value = digitsOf(amount);
  const ready =
    category !== '' &&
    description.trim().length > 0 &&
    payee.trim().length > 0 &&
    value > 0 &&
    Boolean(nextDueAt);

  const every = EXPENSE_FREQUENCY_OPTIONS.find((option) => option.value === frequency)?.every ?? 'month';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden p-0 sm:max-w-md">
        <DialogHeader title="Add recurring cost" className="shrink-0">
          <p className="text-sm text-muted-foreground">
            A cost that comes back — rent, a salary, a premium. No receipt: nothing has been paid yet.
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recurring-description">What it is</Label>
            <Input
              id="recurring-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Office rent"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recurring-payee">Who gets paid</Label>
            <Input
              id="recurring-payee"
              value={payee}
              onChange={(event) => setPayee(event.target.value)}
              placeholder="Landlord, employee or supplier"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="recurring-category">Kind</Label>
              <Select
                id="recurring-category"
                value={category}
                onChange={(event) => setCategory(event.target.value as ExpenseCategory)}
                placeholder="Choose"
                options={CATEGORY_OPTIONS}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="recurring-amount">Amount each time (DJF)</Label>
              <Input
                id="recurring-amount"
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0"
                className="tabular-nums"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="recurring-frequency">How often</Label>
              <Select
                id="recurring-frequency"
                value={frequency}
                onChange={(event) => setFrequency(event.target.value as ExpenseFrequency)}
                options={EXPENSE_FREQUENCY_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>First one due</Label>
              <DatePicker value={nextDueAt} onChange={setNextDueAt} placeholder="Next payment" />
            </div>
          </div>
        </div>

        {create.isError ? (
          <p className="shrink-0 px-5 pb-2 text-sm text-destructive sm:px-6">
            {(create.error as Error).message}
          </p>
        ) : null}

        <DialogFooter className="shrink-0 border-t border-border-subtle">
          {/* What it costs per MONTH, whatever its own rhythm — the figure that
              matters and the one nobody works out in their head for a
              quarterly premium. Shown only when it differs from the amount. */}
          <span className="mr-auto text-sm text-muted-foreground">
            {value > 0 ? (
              <>
                <span className="font-semibold tabular-nums text-foreground">{fmtDjf(value)}</span> every{' '}
                {every}
                {frequency !== 'MONTHLY' ? (
                  <>
                    {' · '}
                    <span className="tabular-nums">{fmtDjf(Math.round(monthlyOf(value, frequency)))}</span> a
                    month
                  </>
                ) : null}
              </>
            ) : (
              'No amount yet'
            )}
          </span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!ready || create.isPending}
            onClick={() =>
              create.mutate(
                {
                  category: category as ExpenseCategory,
                  description: description.trim(),
                  vendorOrPayee: payee.trim(),
                  amount: value,
                  frequency,
                  nextDueAt,
                },
                { onSuccess: () => onOpenChange(false) },
              )
            }
          >
            {create.isPending ? 'Adding…' : 'Add cost'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
