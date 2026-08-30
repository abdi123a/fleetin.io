import { useQuery } from '@tanstack/react-query';

import { fetchTeam } from './teamService';

export const teamQueryKeys = {
  all: ['team'] as const,
};

/**
 * The assignable team.
 *
 * Long `staleTime`: a colleague list changes when somebody joins or leaves,
 * not between two clicks of a picker, and this query is mounted by every
 * shipment row that draws a crew stack.
 */
export function useTeam() {
  return useQuery({
    queryKey: teamQueryKeys.all,
    queryFn: fetchTeam,
    staleTime: 5 * 60 * 1000,
  });
}
