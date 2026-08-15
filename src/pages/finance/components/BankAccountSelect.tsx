import { Select } from '@/design-system';
import { useBankAccounts } from '@/features/bank-accounts';

/**
 * Every real money movement (pay-transporter, mark-invoice-paid) requires a
 * `bankAccountId` server-side — this is the one picker both actions share.
 */
export function BankAccountSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (bankAccountId: string) => void;
}) {
  const { data: accounts = [] } = useBankAccounts();

  return (
    <Select
      value={value}
      options={[
        { value: '', label: accounts.length === 0 ? 'No bank accounts registered' : 'Select an account…' },
        ...accounts.map((account) => ({
          value: account.id,
          label: `${account.bankName} · ${account.accountNumber.slice(-4)} (${account.currency})`,
        })),
      ]}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
