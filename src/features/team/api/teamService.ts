import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';

/**
 * The Fleetin team — the colleagues who can be put on a shipment.
 *
 * Deliberately not the Administration account directory (`accessService`).
 * Two of the accounts in that list are *portal* logins belonging to a shipper
 * and a transporter, and offering a customer in an internal assignment picker
 * would put their face on our own job. The server filters them out; this
 * module is the read side of that one endpoint and nothing else.
 */

export interface TeamMember {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  avatarUrl: string | null;
  roleName: string | null;
  role: { id: string; name: string; description: string | null } | null;
}

function token() {
  return useAuthStore.getState().accessToken;
}

export async function fetchTeam(): Promise<TeamMember[]> {
  const res = await apiClient.get<TeamMember[]>('/users/team', token());
  return res.data;
}
