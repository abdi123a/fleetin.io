import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEMO_PRESETS } from '@/data/demoPresets';

/**
 * Local account directory + access-request queue.
 *
 * This app has no live backend (see `api.client.ts` — it targets
 * `localhost:3000/api/v1`, which nothing in this repo runs). Until a real
 * API exists, this store IS the source of truth `auth.store.ts` falls back
 * to whenever that call fails: it is what lets login distinguish "this email
 * isn't registered" from "that password is wrong" instead of one opaque
 * network error. Every account here still requires an exact password match —
 * unlike the old demo-mode fallback it replaces, nothing here grants a
 * session for free.
 *
 * "Register" does not create an account directly. It calls `submitRequest`,
 * which lands in `requests` for an admin to review on the Administration
 * page. `approveRequest` is what actually creates the `DirectoryAccount` —
 * using the password the requester chose — so they can log in afterwards.
 */

export interface DirectoryAccount {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
  companyName?: string;
  shipperId?: string;
  transporterId?: string;
}

export type AccessRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface AccessRequest {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  password: string;
  companyName?: string;
  status: AccessRequestStatus;
  requestedAt: string;
  decidedAt?: string;
}

export type AccessRequestInput = Pick<
  AccessRequest,
  'firstName' | 'lastName' | 'email' | 'phone' | 'password' | 'companyName'
>;

/** Shared password for every seeded demo account, also used by the login
 *  page's "quick demo" picker so the two stay in sync. */
export const DEMO_ACCOUNT_PASSWORD = 'Shipper@2026!';

function seedAccountId(preset: { shipperId?: string; transporterId?: string; role: string }): string {
  if (preset.shipperId) return `shipper-${preset.shipperId}`;
  if (preset.transporterId) return `transporter-${preset.transporterId}`;
  return `demo-${preset.role.toLowerCase()}`;
}

const SEED_ACCOUNTS: DirectoryAccount[] = DEMO_PRESETS.map((preset) => ({
  id: seedAccountId(preset),
  email: preset.email,
  password: DEMO_ACCOUNT_PASSWORD,
  firstName: preset.firstName,
  lastName: preset.lastName,
  role: preset.role,
  companyName: preset.companyName,
  shipperId: preset.shipperId,
  transporterId: preset.transporterId,
}));

interface AccessRequestState {
  accounts: DirectoryAccount[];
  requests: AccessRequest[];

  /** Files a new access request; does not create a login-capable account. */
  submitRequest: (data: AccessRequestInput) => AccessRequest;
  /** Creates the account from the request's own chosen password, marks it approved. */
  approveRequest: (id: string) => void;
  rejectRequest: (id: string) => void;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const useAccessRequestStore = create<AccessRequestState>()(
  persist(
    (set, get) => ({
      accounts: SEED_ACCOUNTS,
      requests: [],

      submitRequest: (data) => {
        const request: AccessRequest = {
          ...data,
          email: normalizeEmail(data.email),
          id: `REQ-${Date.now()}`,
          status: 'PENDING',
          requestedAt: new Date().toISOString(),
        };
        set((state) => ({ requests: [request, ...state.requests] }));
        return request;
      },

      approveRequest: (id) => {
        const request = get().requests.find((r) => r.id === id);
        if (!request || request.status !== 'PENDING') return;

        const account: DirectoryAccount = {
          id: `user-${request.id}`,
          email: request.email,
          password: request.password,
          firstName: request.firstName,
          lastName: request.lastName,
          role: 'MANAGER',
          companyName: request.companyName,
        };

        set((state) => ({
          accounts: [...state.accounts, account],
          requests: state.requests.map((r) =>
            r.id === id ? { ...r, status: 'APPROVED' as const, decidedAt: new Date().toISOString() } : r,
          ),
        }));
      },

      rejectRequest: (id) => {
        set((state) => ({
          requests: state.requests.map((r) =>
            r.id === id ? { ...r, status: 'REJECTED' as const, decidedAt: new Date().toISOString() } : r,
          ),
        }));
      },
    }),
    { name: 'fleetin-access-requests-storage' },
  ),
);

/** Looks up a directory account by email — the check `auth.store.ts` uses to
 *  tell "unregistered email" apart from "wrong password". */
export function findAccountByEmail(email: string): DirectoryAccount | undefined {
  const target = normalizeEmail(email);
  return useAccessRequestStore.getState().accounts.find((a) => a.email.toLowerCase() === target);
}

export function findPendingRequestByEmail(email: string): AccessRequest | undefined {
  const target = normalizeEmail(email);
  return useAccessRequestStore
    .getState()
    .requests.find((r) => r.email.toLowerCase() === target && r.status === 'PENDING');
}
