import { useQuery } from '@tanstack/react-query';
import { fetchLedgerEntries, type LedgerFilters } from './ledgerService';

export const ledgerQueryKeys = {
  list: (filters: LedgerFilters) => ['ledger-entries', 'list', filters] as const,
};

export function useLedgerEntries(filters: LedgerFilters = {}) {
  return useQuery({
    queryKey: ledgerQueryKeys.list(filters),
    queryFn: () => fetchLedgerEntries(filters),
  });
}
