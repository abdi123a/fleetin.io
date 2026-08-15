import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchSettings, updateSettings, type UpdateSettingsPayload } from './settingsService';

export const settingsQueryKeys = {
  all: ['settings'] as const,
};

export function useSettings() {
  return useQuery({ queryKey: settingsQueryKeys.all, queryFn: fetchSettings });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateSettingsPayload) => updateSettings(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.all });
      // The commission decides what every future shipment and booking pays a
      // transporter, so anything already on screen showing money is stale.
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}
