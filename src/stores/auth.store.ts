import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ApiError, apiClient } from '@/services/api.client';
import { ENV } from '@/config/app';
import { DEMO_PRESETS, type DemoPresetUser } from '@/data/demoPresets';
import { findAccountByEmail } from './access-request.store';

export { DEMO_PRESETS };
export type { DemoPresetUser };

export interface UserPermissions {
  [key: string]: boolean | string[];
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'MANAGER' | 'DISPATCHER' | 'DRIVER' | 'SHIPPER' | 'CLIENT' | 'TRANSPORTER' | string;
  permissions?: string[] | UserPermissions;
  avatarUrl?: string;
  shipperId?: string;
  transporterId?: string;
  companyName?: string;
}

/** Payload returned by `POST /auth/login`. */
interface LoginResponse {
  user: UserProfile;
  accessToken: string;
  refreshToken: string;
}

interface AuthState {
  user: UserProfile | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (email: string, pass: string) => Promise<void>;
  loginAsDemoPreset: (preset: DemoPresetUser) => void;
  logout: () => void;
  clearError: () => void;
}

/**
 * True login failure — unregistered email, wrong password, or a malformed
 * backend response. Its `message` is what `LoginPage` displays, so it always
 * carries the specific, user-facing reason rather than a raw fetch error.
 */
export class AuthenticationError extends Error {}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      // Logged out by default, unconditionally. Demo mode (when explicitly
      // enabled, see ENV.isDemoModeEnabled) makes the demo picker on the
      // login page usable — it does not pre-authenticate the app on load.
      // Booting into an already-authenticated ADMIN session was itself the
      // most severe form of the vulnerability this fixes: it required no
      // error, no backend call and no user action at all.
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email: string, pass: string) => {
        set({ isLoading: true, error: null });

        try {
          const res = await apiClient.post<LoginResponse>('/auth/login', { email, password: pass });
          if (res.success && res.data) {
            set({
              user: res.data.user,
              accessToken: res.data.accessToken,
              refreshToken: res.data.refreshToken,
              isAuthenticated: true,
              isLoading: false,
            });
            return;
          }
        } catch (err) {
          // A reply from the backend is the final answer, even a rejection —
          // only an *unreachable* backend may fall through to the local
          // directory below. Falling through on a 401 was silently logging
          // the user in against the local mock instead: the page saw a
          // success, routed to the dashboard, and every real request there
          // then 401'd on the fake `local-token-*`, bouncing back to login
          // with no error ever shown.
          if (err instanceof ApiError) {
            const message =
              err.status === 401 ? 'Incorrect email or password.' : err.message;
            set({ isLoading: false, error: message, isAuthenticated: false });
            throw new AuthenticationError(message);
          }
        }

        // No live backend exists yet (see api.client.ts) — the account
        // directory in access-request.store.ts is this app's real source of
        // truth for "who can log in" until one does. Unlike the old
        // demo-mode fallback it replaces, nothing here is granted for free:
        // an unmatched email and a wrong password are distinct, and both
        // fail closed (no user, no tokens, isAuthenticated stays false).
        const account = findAccountByEmail(email);

        if (!account) {
          const message = 'This email is not registered. Request access to create an account.';
          set({ isLoading: false, error: message, isAuthenticated: false });
          throw new AuthenticationError(message);
        }

        if (account.password !== pass) {
          const message = 'Incorrect password. Please try again.';
          set({ isLoading: false, error: message, isAuthenticated: false });
          throw new AuthenticationError(message);
        }

        set({
          user: {
            id: account.id,
            email: account.email,
            firstName: account.firstName,
            lastName: account.lastName,
            role: account.role,
            shipperId: account.shipperId,
            transporterId: account.transporterId,
            companyName: account.companyName,
            permissions: ['*'],
          },
          accessToken: `local-token-${account.id}`,
          refreshToken: `local-refresh-${account.id}`,
          isAuthenticated: true,
          isLoading: false,
        });
      },

      loginAsDemoPreset: (preset: DemoPresetUser) => {
        // Defence in depth: LoginPage only renders the picker when demo mode
        // is enabled, but the action itself must refuse too, in case it is
        // ever reached another way (a stale build, a direct store call).
        if (!ENV.isDemoModeEnabled) {
          console.error('[demo-auth] loginAsDemoPreset() called with demo mode disabled — ignored.');
          return;
        }

        set({
          user: {
            id: preset.shipperId
              ? `shipper-${preset.shipperId}`
              : preset.transporterId
                ? `transporter-${preset.transporterId}`
                : `demo-${preset.role.toLowerCase()}-01`,
            email: preset.email,
            firstName: preset.firstName,
            lastName: preset.lastName,
            role: preset.role,
            shipperId: preset.shipperId,
            transporterId: preset.transporterId,
            companyName: preset.companyName,
            permissions: ['*'],
          },
          accessToken: `demo-token-${preset.role}`,
          refreshToken: `demo-refresh-${preset.role}`,
          isAuthenticated: true,
          error: null,
        });
      },

      logout: () => {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          error: null,
        });
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'fleetin-auth-storage',
      // `isLoading`/`error` are transient UI state, not session state. Without
      // this, a failed login's error message got written to localStorage and
      // came back on the *next* page load — a stale "Incorrect password"
      // banner appearing before the visitor had typed anything, which read as
      // the login page glitching.
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
