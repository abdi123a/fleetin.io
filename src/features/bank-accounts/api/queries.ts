import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  closeBankAccount,
  createBankAccount,
  depositToBankAccount,
  fetchBankAccount,
  fetchBankAccounts,
  fetchBankMovements,
  removeBankAccountLogo,
  transferBetweenBankAccounts,
  updateBankAccount,
  uploadBankAccountLogo,
  withdrawFromBankAccount,
  type CreateBankAccountPayload,
  type RecordMovementPayload,
  type TransferFundsPayload,
  type UpdateBankAccountPayload,
} from './bankAccountsService';

export const bankAccountQueryKeys = {
  all: ['bank-accounts'] as const,
  detail: (id: string) => ['bank-accounts', 'detail', id] as const,
  movements: (bankAccountId?: string) => ['bank-accounts', 'movements', bankAccountId ?? 'all'] as const,
};

export function useBankAccounts() {
  return useQuery({
    queryKey: bankAccountQueryKeys.all,
    queryFn: fetchBankAccounts,
  });
}

export function useBankAccount(id: string | undefined) {
  return useQuery({
    queryKey: bankAccountQueryKeys.detail(id ?? ''),
    queryFn: () => fetchBankAccount(id as string),
    enabled: Boolean(id),
  });
}

export function useBankMovements(bankAccountId?: string) {
  return useQuery({
    queryKey: bankAccountQueryKeys.movements(bankAccountId),
    queryFn: () => fetchBankMovements({ bankAccountId }),
  });
}

/**
 * Every mutation below lands on the same two caches — an account's balance and
 * the movement that moved it are never refreshed apart, or the page would show
 * a transfer with the old balances still under it.
 */
function useBankAccountMutation<TArgs, TResult>(mutationFn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bankAccountQueryKeys.all });
    },
  });
}

export function useCreateBankAccount() {
  return useBankAccountMutation((payload: CreateBankAccountPayload) => createBankAccount(payload));
}

export function useUpdateBankAccount() {
  return useBankAccountMutation(({ id, payload }: { id: string; payload: UpdateBankAccountPayload }) =>
    updateBankAccount(id, payload),
  );
}

export function useCloseBankAccount() {
  return useBankAccountMutation((id: string) => closeBankAccount(id));
}

export function useUploadBankAccountLogo() {
  return useBankAccountMutation(({ id, file }: { id: string; file: File }) => uploadBankAccountLogo(id, file));
}

export function useRemoveBankAccountLogo() {
  return useBankAccountMutation((id: string) => removeBankAccountLogo(id));
}

export function useDepositToBankAccount() {
  return useBankAccountMutation(({ id, payload }: { id: string; payload: RecordMovementPayload }) =>
    depositToBankAccount(id, payload),
  );
}

export function useWithdrawFromBankAccount() {
  return useBankAccountMutation(({ id, payload }: { id: string; payload: RecordMovementPayload }) =>
    withdrawFromBankAccount(id, payload),
  );
}

export function useTransferBetweenBankAccounts() {
  return useBankAccountMutation(({ fromId, payload }: { fromId: string; payload: TransferFundsPayload }) =>
    transferBetweenBankAccounts(fromId, payload),
  );
}
