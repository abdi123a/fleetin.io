import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';

import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Building2,
  Landmark,
  Pencil,
  Plus,
  Wallet,
} from '@/design-system/icons';
import { Button, Checkbox, Input, Select, Sheet, SheetContent, SheetDescription, SheetTitle } from '@/design-system';
import { TablePager, usePagedRows } from '@/components';
import { formatMoneyMinorUnits } from '@/lib/finance';
import {
  useBankAccounts,
  useBankMovements,
  useCreateBankAccount,
  useDepositToBankAccount,
  useRemoveBankAccountLogo,
  useTransferBetweenBankAccounts,
  useUpdateBankAccount,
  useUploadBankAccountLogo,
  useWithdrawFromBankAccount,
} from '@/features/bank-accounts';
import type {
  BankAccountRecord,
  BankMovementRecord,
  CreateBankAccountPayload,
  RecordMovementPayload,
} from '@/features/bank-accounts';

import { BankLogo, BankLogoPicker } from './components/BankLogo';
import { MovementSheet, TransferSheet } from './components/BankMoneyForms';
import { DataTable, EmptyState, PageHead, Panel, Pill, StatCard, Td, Th } from './components/kit';

/**
 * Every account real money is actually held in — registered, edited, and moved
 * between here.
 *
 * The one rule this desk keeps: a balance is never typed. It changes because a
 * deposit, a withdrawal or a transfer was recorded, or because an invoice or
 * payout posted against it — so every figure in the Balance column has a row
 * underneath it saying how it got there. Editing an account touches its
 * details and its logo, never its money.
 */

const CURRENCY_OPTIONS = [
  { value: 'DJF', label: 'DJF — Djiboutian Franc' },
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
];

const EMPTY_FORM: CreateBankAccountPayload = {
  bankName: '',
  accountHolder: '',
  accountNumber: '',
  iban: '',
  swiftCode: '',
  currency: 'DJF',
  isPrimary: false,
};

const MOVEMENT_LABEL: Record<BankMovementRecord['type'], string> = {
  DEPOSIT: 'Deposit',
  WITHDRAWAL: 'Withdrawal',
  TRANSFER_IN: 'Transfer in',
  TRANSFER_OUT: 'Transfer out',
};

/**
 * Stable empty defaults. An inline `= []` would be a fresh array on every
 * render, and the transfer sheet's reset effect depends on the account list —
 * a new reference each render would re-arm it forever.
 */
const NO_ACCOUNTS: BankAccountRecord[] = [];
const NO_MOVEMENTS: BankMovementRecord[] = [];

function maskAccountNumber(value: string): string {
  const tail = value.slice(-4);
  return value.length <= 4 ? value : `•••• ${tail}`;
}

function formatMovementDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function FinanceAccountsPage() {
  const { data: accounts = NO_ACCOUNTS, isLoading } = useBankAccounts();
  const { data: movements = NO_MOVEMENTS } = useBankMovements();
  /**
   * The register used to render `movements.slice(0, 25)` — the desk's 26th
   * movement simply did not exist on screen. Paged instead, so every recorded
   * leg is reachable and the reader can say which page it was on.
   */
  const [movementsPageSize, setMovementsPageSize] = useState(25);
  const pagedMovements = usePagedRows(movements, { pageSize: movementsPageSize });

  const createBankAccount = useCreateBankAccount();
  const updateBankAccount = useUpdateBankAccount();
  const uploadLogo = useUploadBankAccountLogo();
  const removeLogo = useRemoveBankAccountLogo();
  const deposit = useDepositToBankAccount();
  const withdraw = useWithdrawFromBankAccount();
  const transfer = useTransferBetweenBankAccounts();

  /** `null` = the sheet is registering a new account; a record = editing it. */
  const [editing, setEditing] = useState<BankAccountRecord | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<CreateBankAccountPayload>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  /** Held until the account exists — the upload endpoint is keyed by its id. */
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoCleared, setLogoCleared] = useState(false);

  const [movementTarget, setMovementTarget] = useState<{ account: BankAccountRecord; mode: 'deposit' | 'withdraw' } | null>(
    null,
  );
  const [transferFrom, setTransferFrom] = useState<string | null>(null);
  const [isTransferOpen, setIsTransferOpen] = useState(false);

  const accountsById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  const balancesByCurrency = useMemo(() => {
    const totals = new Map<string, bigint>();
    for (const account of accounts) {
      const running = totals.get(account.currency) ?? 0n;
      totals.set(account.currency, running + BigInt(account.currentBalance));
    }
    return Array.from(totals.entries());
  }, [accounts]);

  // Object URLs are only freed when the file changes or the sheet closes;
  // leaving them alive would leak one blob per re-pick.
  useEffect(() => {
    if (!logoFile) return;
    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setLogoFile(null);
    setLogoPreview(null);
    setLogoCleared(false);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEdit = (account: BankAccountRecord) => {
    setEditing(account);
    setForm({
      bankName: account.bankName,
      accountHolder: account.accountHolder,
      accountNumber: account.accountNumber,
      iban: account.iban ?? '',
      swiftCode: account.swiftCode ?? '',
      currency: account.currency,
      isPrimary: account.isPrimary,
    });
    setLogoFile(null);
    setLogoPreview(account.logoUrl ?? null);
    setLogoCleared(false);
    setFormError(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setLogoFile(null);
    setLogoPreview(null);
    setLogoCleared(false);
    setFormError(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!form.bankName || !form.accountHolder || !form.accountNumber) return;

    const payload = {
      ...form,
      iban: form.iban || undefined,
      swiftCode: form.swiftCode || undefined,
    };

    try {
      const account = editing
        ? await updateBankAccount.mutateAsync({ id: editing.id, payload })
        : await createBankAccount.mutateAsync(payload);

      if (logoFile) await uploadLogo.mutateAsync({ id: account.id, file: logoFile });
      else if (logoCleared && editing?.logoUrl) await removeLogo.mutateAsync(account.id);

      closeForm();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The account could not be saved.');
    }
  };

  const isSaving =
    createBankAccount.isPending || updateBankAccount.isPending || uploadLogo.isPending || removeLogo.isPending;

  const handleMovement = async (payload: RecordMovementPayload) => {
    if (!movementTarget) return;
    const mutation = movementTarget.mode === 'deposit' ? deposit : withdraw;
    await mutation.mutateAsync({ id: movementTarget.account.id, payload });
  };

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 pb-8 pt-1 sm:px-6">
      <PageHead
        title="Bank Accounts"
        subtitle="Accounts receipts land in and settlements leave from"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => {
                setTransferFrom(null);
                setIsTransferOpen(true);
              }}
              shape="pill"
              variant="outline"
              disabled={accounts.length < 2}
              leadingIcon={<ArrowLeftRight className="h-4 w-4" />}
              className="px-4 py-2 text-xs font-semibold cursor-pointer"
            >
              Transfer
            </Button>
            <Button
              onClick={openCreate}
              shape="pill"
              leadingIcon={<Plus className="h-4 w-4" />}
              className="bg-primary hover:bg-primary-hover text-primary-foreground font-semibold px-4 py-2 text-xs shadow-xs cursor-pointer"
            >
              New Account
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Landmark}
          tint="teal"
          label="Accounts"
          value={String(accounts.length)}
          hint={accounts.length === 0 ? 'None registered yet' : `${accounts.filter((a) => a.isPrimary).length} primary`}
        />
        {balancesByCurrency.length === 0 ? (
          <StatCard icon={Wallet} tint="neutral" label="Balance" value="—" hint="No accounts yet" />
        ) : (
          balancesByCurrency.map(([currency, total]) => (
            <StatCard
              key={currency}
              icon={Wallet}
              tint="teal"
              label={`Balance (${currency})`}
              value={formatMoneyMinorUnits(total, currency)}
              hint="Across accounts in this currency"
            />
          ))
        )}
      </div>

      <Panel
        title="Accounts"
        subtitle="Balances move only through a recorded movement"
        padded={false}
      >
        {isLoading ? (
          <div className="px-5 py-6">
            <EmptyState message="Loading accounts…" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="px-5 py-6">
            <EmptyState message="No accounts yet." />
          </div>
        ) : (
          <DataTable minWidth={860}>
            <thead>
              <tr>
                <Th>Bank</Th>
                <Th>Account Holder</Th>
                <Th>Account No.</Th>
                <Th>Currency</Th>
                <Th align="right">Balance</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} className="transition-colors hover:bg-surface-sunken/60">
                  <Td>
                    <span className="flex items-center gap-2.5">
                      <BankLogo logoUrl={account.logoUrl} name={account.bankName} size={36} />
                      <span className="flex flex-col">
                        <span className="text-sm font-bold text-foreground">{account.bankName}</span>
                        {account.isPrimary ? <Pill tone="teal">Primary</Pill> : null}
                      </span>
                    </span>
                  </Td>
                  <Td>
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <Building2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      {account.accountHolder}
                    </span>
                  </Td>
                  <Td>
                    <span className="font-mono text-xs font-semibold text-muted-foreground">
                      {maskAccountNumber(account.accountNumber)}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-xs font-bold text-muted-foreground">{account.currency}</span>
                  </Td>
                  <Td align="right">
                    <span className="font-mono text-sm font-bold tabular-nums text-foreground">
                      {formatMoneyMinorUnits(account.currentBalance, account.currency)}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="flex items-center justify-end gap-1">
                      <RowAction
                        label="Deposit"
                        icon={ArrowDownLeft}
                        onClick={() => setMovementTarget({ account, mode: 'deposit' })}
                      />
                      <RowAction
                        label="Withdraw"
                        icon={ArrowUpRight}
                        onClick={() => setMovementTarget({ account, mode: 'withdraw' })}
                      />
                      <RowAction
                        label="Transfer"
                        icon={ArrowLeftRight}
                        disabled={accounts.length < 2}
                        onClick={() => {
                          setTransferFrom(account.id);
                          setIsTransferOpen(true);
                        }}
                      />
                      <RowAction label="Edit" icon={Pencil} onClick={() => openEdit(account)} />
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Panel>

      <Panel
        title="Movements"
        subtitle="Deposits, withdrawals and transfers"
        padded={false}
      >
        {movements.length === 0 ? (
          <div className="px-5 py-6">
            <EmptyState message="No movements yet." />
          </div>
        ) : (
          <DataTable minWidth={860}>
            <thead>
              <tr>
                <Th>Reference</Th>
                <Th>Account</Th>
                <Th>Type</Th>
                <Th>Detail</Th>
                <Th>Date</Th>
                <Th align="right">Amount</Th>
                <Th align="right">Balance After</Th>
              </tr>
            </thead>
            <tbody>
              {pagedMovements.rows.map((movement) => {
                const account = accountsById.get(movement.bankAccountId);
                const counterparty = movement.counterpartyAccountId
                  ? accountsById.get(movement.counterpartyAccountId)
                  : undefined;
                const isIn = movement.direction === 'IN';

                return (
                  <tr key={movement.id} className="transition-colors hover:bg-surface-sunken/60">
                    <Td>
                      <span className="font-mono text-xs font-bold text-muted-foreground">{movement.reference}</span>
                    </Td>
                    <Td>
                      <span className="flex items-center gap-2">
                        <BankLogo
                          logoUrl={account?.logoUrl}
                          name={account?.bankName ?? 'Account'}
                          size={36}
                          className="scale-[0.72]"
                        />
                        <span className="text-sm font-bold text-foreground">{account?.bankName ?? '—'}</span>
                      </span>
                    </Td>
                    <Td>
                      <Pill tone={isIn ? 'teal' : 'orange'}>{MOVEMENT_LABEL[movement.type]}</Pill>
                    </Td>
                    <Td>
                      <span className="flex flex-col">
                        <span className="text-xs font-semibold text-foreground">
                          {counterparty ? counterparty.bankName : (movement.description ?? '—')}
                        </span>
                        <span className="text-[11px] font-semibold text-muted-foreground">
                          {movement.createdByName}
                          {movement.externalReference ? ` · ${movement.externalReference}` : ''}
                        </span>
                      </span>
                    </Td>
                    <Td>
                      <span className="text-xs font-semibold text-muted-foreground">
                        {formatMovementDate(movement.occurredAt)}
                      </span>
                    </Td>
                    <Td align="right">
                      <span
                        className={`font-mono text-sm font-bold tabular-nums ${
                          isIn ? 'text-primary-subtle-foreground' : 'text-accent-subtle-foreground'
                        }`}
                      >
                        {isIn ? '+' : '−'}
                        {formatMoneyMinorUnits(movement.amountMinorUnits, movement.currency)}
                      </span>
                    </Td>
                    <Td align="right">
                      <span className="font-mono text-xs font-semibold tabular-nums text-muted-foreground">
                        {formatMoneyMinorUnits(movement.balanceAfterMinorUnits, movement.currency)}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
        {movements.length > 0 ? (
          <TablePager
            paged={pagedMovements}
            noun="movements"
            pageSize={movementsPageSize}
            onPageSizeChange={setMovementsPageSize}
            className="px-5 pb-4"
          />
        ) : null}
      </Panel>

      {/* ─── Register / edit ──────────────────────────────────────────── */}
      <Sheet open={isFormOpen} onOpenChange={(open) => (open ? setIsFormOpen(true) : closeForm())}>
        <SheetContent
          side="right"
          className="flex h-full w-full flex-col gap-0 overflow-hidden border-l border-border bg-background p-0 sm:max-w-md"
        >
          <div className="shrink-0 space-y-1 border-b border-border/40 px-6 pb-4 pt-6 sm:px-8 sm:pt-8">
            <SheetTitle className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-foreground">
              <Landmark className="h-5 w-5 text-primary" />
              {editing ? 'Edit Bank Account' : 'Register Bank Account'}
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              {editing
                ? 'Details and logo only. The balance is not editable — correct it with a deposit or a withdrawal, so the correction leaves a row behind.'
                : 'Every payment in or out of Fleetin has to be booked against a real account. Balances start at zero and move only through recorded movements, invoice payments, payouts and drawdowns.'}
            </SheetDescription>
          </div>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 sm:px-8">
              <div className="space-y-4">
                <BankLogoPicker
                  previewUrl={logoPreview}
                  fileName={logoFile?.name ?? null}
                  bankName={form.bankName}
                  onPick={(file) => {
                    setLogoFile(file);
                    setLogoCleared(false);
                  }}
                  onClear={() => {
                    setLogoFile(null);
                    setLogoPreview(null);
                    setLogoCleared(true);
                  }}
                />

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-foreground block">Bank Name *</label>
                  <Input
                    required
                    value={form.bankName}
                    onChange={(e) => setForm((prev) => ({ ...prev, bankName: e.target.value }))}
                    placeholder="e.g. CAC Bank"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-foreground block">Account Holder *</label>
                  <Input
                    required
                    value={form.accountHolder}
                    onChange={(e) => setForm((prev) => ({ ...prev, accountHolder: e.target.value }))}
                    placeholder="e.g. Fleetin SARL"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-foreground block">Account Number *</label>
                    <Input
                      required
                      value={form.accountNumber}
                      onChange={(e) => setForm((prev) => ({ ...prev, accountNumber: e.target.value }))}
                      placeholder="00123456789"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-foreground block">Currency *</label>
                    <Select
                      value={form.currency}
                      options={CURRENCY_OPTIONS}
                      onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-foreground block">IBAN</label>
                    <Input
                      value={form.iban}
                      onChange={(e) => setForm((prev) => ({ ...prev, iban: e.target.value }))}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-foreground block">SWIFT / BIC</label>
                    <Input
                      value={form.swiftCode}
                      onChange={(e) => setForm((prev) => ({ ...prev, swiftCode: e.target.value }))}
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <Checkbox
                  label="Mark as primary account"
                  checked={form.isPrimary ?? false}
                  onChange={(e) => setForm((prev) => ({ ...prev, isPrimary: e.target.checked }))}
                  className="pt-1"
                />

                {editing ? (
                  <p className="rounded-lg bg-surface-sunken px-3 py-2.5 text-xs font-semibold text-muted-foreground">
                    Balance ·{' '}
                    <span className="font-mono font-bold tabular-nums text-foreground">
                      {formatMoneyMinorUnits(editing.currentBalance, editing.currency)}
                    </span>
                  </p>
                ) : null}
              </div>
            </div>

            {formError ? (
              <p className="shrink-0 border-t border-destructive/30 bg-destructive-subtle px-6 py-3 text-xs font-bold text-destructive-subtle-foreground sm:px-8">
                {formError}
              </p>
            ) : null}

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/40 bg-background px-6 py-4 sm:px-8">
              <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={closeForm}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSaving}
                className="rounded-lg bg-primary px-5 font-semibold text-primary-foreground"
              >
                {isSaving ? 'Saving…' : editing ? 'Save Changes' : 'Register Account'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <MovementSheet
        account={movementTarget?.account ?? null}
        mode={movementTarget?.mode ?? 'deposit'}
        open={Boolean(movementTarget)}
        onOpenChange={(open) => {
          if (!open) setMovementTarget(null);
        }}
        onSubmit={handleMovement}
        pending={deposit.isPending || withdraw.isPending}
      />

      <TransferSheet
        accounts={accounts}
        fromAccountId={transferFrom}
        open={isTransferOpen}
        onOpenChange={setIsTransferOpen}
        onSubmit={(fromId, payload) => transfer.mutateAsync({ fromId, payload })}
        pending={transfer.isPending}
      />
    </div>
  );
}

/** Icon-only row control — the four things you can do to one account. */
function RowAction({
  label,
  icon: Icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: (props: { className?: string; 'aria-hidden'?: boolean }) => ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="cursor-pointer rounded-md border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-border hover:bg-surface-sunken hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon aria-hidden className="size-4" />
    </button>
  );
}

export default FinanceAccountsPage;
