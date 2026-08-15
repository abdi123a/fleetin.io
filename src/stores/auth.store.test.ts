import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/services/api.client';
import type * as ApiClientModule from '@/services/api.client';
import type { DemoPresetUser } from './auth.store';
import { DEMO_ACCOUNT_PASSWORD } from './access-request.store';

/**
 * Node exposes a global `localStorage` (stable since Node 22), but it is
 * file-backed and inert unless the process was started with
 * `--localstorage-file=<path>` — every method throws or no-ops otherwise.
 * `zustand/middleware`'s `persist` needs a real, working `Storage`, so this
 * test supplies its own minimal in-memory implementation rather than relying
 * on Node's flag-gated one.
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

globalThis.localStorage = new MemoryStorage();

/**
 * Proves two things about `login()`:
 *
 * 1. The Phase 2 fix still holds: a backend outage or bad credentials never
 *    grants a session. `login()` used to catch *any* backend error and
 *    silently grant `permissions: ['*']` — a backend outage handed every
 *    visitor superuser rights. It cannot do that anymore.
 * 2. The Phase 3 fix (this file's real subject now): when the backend is
 *    unreachable, `login()` falls back to the local account directory
 *    (`access-request.store.ts`) instead of the old `ENV.isDemoModeEnabled`
 *    "any password works" shortcut. An unregistered email and a wrong
 *    password now fail with distinct, specific messages — and both still
 *    fail *closed*, exactly like point 1. `ENV.isDemoModeEnabled`
 *    (`src/config/app.ts`) is left gating only `loginAsDemoPreset`, the
 *    login page's picker button — never typed-credential login.
 *
 * `ENV.isDemoModeEnabled` is computed once, at module-evaluation time, from
 * `import.meta.env`. To exercise both settings of it, each test stubs the
 * env var *before* dynamically importing a fresh copy of the store —
 * `vi.resetModules()` forces `@/config/app` (and therefore `ENV`) to be
 * re-evaluated against the current stub.
 */

const postMock = vi.fn();

// `ApiError` is kept real rather than stubbed: `login()` distinguishes a
// backend that *answered* (any ApiError — surface it) from one that is
// unreachable (fall back to the local directory), and that branch is an
// `instanceof` check, so a fake class would silently take the wrong path.
vi.mock('@/services/api.client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClientModule>()),
  apiClient: { post: (...args: unknown[]) => postMock(...args) },
}));

async function freshAuthStore() {
  vi.resetModules();
  return import('./auth.store');
}

/** `Array.prototype.find` types its result as possibly `undefined`; this
 * throws instead of asserting `!`, per the project's no-non-null-assertion
 * rule — a lookup that can't find its preset is a broken test fixture, and
 * should fail loudly rather than proceed with `undefined`. */
function requirePreset(
  presets: DemoPresetUser[],
  predicate: (preset: DemoPresetUser) => boolean,
): DemoPresetUser {
  const found = presets.find(predicate);
  if (!found) throw new Error('Expected demo preset not found in DEMO_PRESETS fixture');
  return found;
}

describe('auth.store — demo-mode security', () => {
  beforeEach(() => {
    postMock.mockReset();
    localStorage.clear();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sanity: Vitest runs as a dev build (import.meta.env.DEV is true)', () => {
    // If this ever fails, every test below is meaningless — isDemoModeEnabled
    // is `DEV && flag`, so a false DEV would make demo mode untestable-on.
    expect(import.meta.env.DEV).toBe(true);
  });

  describe('initial state', () => {
    it('boots logged out with demo mode disabled', async () => {
      vi.stubEnv('VITE_ENABLE_DEMO_AUTH', 'false');
      const { useAuthStore } = await freshAuthStore();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      expect(state.refreshToken).toBeNull();
    });

    it('boots logged out even with demo mode enabled — demo mode gates the picker, it does not auto-login', async () => {
      vi.stubEnv('VITE_ENABLE_DEMO_AUTH', 'true');
      const { useAuthStore } = await freshAuthStore();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
    });
  });

  describe('demo mode disabled (default — production behaviour)', () => {
    it('does NOT grant access when the backend is unreachable', async () => {
      vi.stubEnv('VITE_ENABLE_DEMO_AUTH', 'false');
      postMock.mockRejectedValue(new Error('Failed to fetch'));
      const { useAuthStore } = await freshAuthStore();

      await expect(
        useAuthStore.getState().login('admin@fleetin.com', 'whatever-password'),
      ).rejects.toThrow();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      expect(state.refreshToken).toBeNull();
      expect(state.isLoading).toBe(false);
    });

    it('does NOT grant access when the backend returns invalid credentials', async () => {
      vi.stubEnv('VITE_ENABLE_DEMO_AUTH', 'false');
      postMock.mockResolvedValue({ success: false, message: 'Invalid email or password' });
      const { useAuthStore } = await freshAuthStore();

      await expect(useAuthStore.getState().login('user@example.com', 'wrong')).rejects.toThrow();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
    });

    it('surfaces a specific, user-facing reason instead of the raw backend error', async () => {
      vi.stubEnv('VITE_ENABLE_DEMO_AUTH', 'false');
      postMock.mockRejectedValue(new Error('ECONNREFUSED'));
      const { useAuthStore } = await freshAuthStore();

      // The backend's raw error ("ECONNREFUSED") is not what login() throws
      // once it falls through to the local account directory — an unknown
      // email always reports "not registered", regardless of why the
      // backend call failed.
      await expect(useAuthStore.getState().login('a@b.com', 'x')).rejects.toThrow(/not registered/i);
      expect(useAuthStore.getState().error).toBeTruthy();
    });

    it('reports "incorrect password" for a registered email typed with the wrong password', async () => {
      vi.stubEnv('VITE_ENABLE_DEMO_AUTH', 'false');
      postMock.mockRejectedValue(new Error('Failed to fetch'));
      const { useAuthStore } = await freshAuthStore();

      await expect(
        useAuthStore.getState().login('admin@fleetin.com', 'definitely-wrong'),
      ).rejects.toThrow(/incorrect password/i);

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
    });

    it('logs in against the local directory with the right password when the backend is unreachable', async () => {
      vi.stubEnv('VITE_ENABLE_DEMO_AUTH', 'false');
      postMock.mockRejectedValue(new Error('Failed to fetch'));
      const { useAuthStore } = await freshAuthStore();

      await useAuthStore.getState().login('admin@fleetin.com', DEMO_ACCOUNT_PASSWORD);

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.email).toBe('admin@fleetin.com');
    });

    it('never grants wildcard permissions because the backend is down', async () => {
      vi.stubEnv('VITE_ENABLE_DEMO_AUTH', 'false');
      postMock.mockRejectedValue(new Error('Network error'));
      const { useAuthStore } = await freshAuthStore();

      await expect(
        useAuthStore.getState().login('admin@fleetin.com', 'whatever'),
      ).rejects.toThrow();

      // The historic bug: the catch block set permissions: ['*'] regardless
      // of who was logging in. Assert no user — and therefore no
      // permissions of any kind — was ever set.
      expect(useAuthStore.getState().user).toBeNull();
    });

    it('loginAsDemoPreset is a no-op', async () => {
      vi.stubEnv('VITE_ENABLE_DEMO_AUTH', 'false');
      const { useAuthStore, DEMO_PRESETS } = await freshAuthStore();

      useAuthStore.getState().loginAsDemoPreset(requirePreset(DEMO_PRESETS, (p) => p.role === 'ADMIN'));

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
    });

    it('still logs in normally when the backend succeeds', async () => {
      vi.stubEnv('VITE_ENABLE_DEMO_AUTH', 'false');
      postMock.mockResolvedValue({
        success: true,
        data: {
          user: {
            id: 'u-1',
            email: 'admin@fleetin.com',
            firstName: 'Real',
            lastName: 'User',
            role: 'ADMIN',
            permissions: ['users.view'],
          },
          accessToken: 'real-access-token',
          refreshToken: 'real-refresh-token',
        },
      });
      const { useAuthStore } = await freshAuthStore();

      await useAuthStore.getState().login('admin@fleetin.com', 'correct-password');

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.email).toBe('admin@fleetin.com');
      // Permissions come from the real backend response, not a hardcoded wildcard.
      expect(state.user?.permissions).toEqual(['users.view']);
      expect(state.accessToken).toBe('real-access-token');
    });
  });

  describe('demo mode enabled (explicit opt-in, dev-only)', () => {
    it('typed login still requires the correct password — the flag no longer bypasses it', async () => {
      // This test used to prove the opposite: with VITE_ENABLE_DEMO_AUTH=true
      // and the backend unreachable, ANY password matched a known demo
      // email. That fallback is gone. `ENV.isDemoModeEnabled` now only
      // gates `loginAsDemoPreset` (the login page's picker button) — typed
      // login always checks the local account directory's real password,
      // regardless of the flag.
      vi.stubEnv('VITE_ENABLE_DEMO_AUTH', 'true');
      postMock.mockRejectedValue(new Error('Failed to fetch'));
      const { useAuthStore } = await freshAuthStore();

      await expect(
        useAuthStore.getState().login('m.amin@amina-fzco.dj', 'anything'),
      ).rejects.toThrow(/incorrect password/i);

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
    });

    it('typed login succeeds with the correct password, flag on or off', async () => {
      vi.stubEnv('VITE_ENABLE_DEMO_AUTH', 'true');
      postMock.mockRejectedValue(new Error('Failed to fetch'));
      const { useAuthStore } = await freshAuthStore();

      await useAuthStore.getState().login('m.amin@amina-fzco.dj', DEMO_ACCOUNT_PASSWORD);

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.shipperId).toBe('SHP-101');
    });

    it('a backend 401 fails closed — it never falls through to the local directory', async () => {
      // The local directory is seeded from `demoPresets.ts`, whose accounts
      // exist only in the frontend; the real database has no user rows for
      // them. Falling through on a rejection therefore granted a session on a
      // fake `local-token-*`: the login page saw success and routed to the
      // dashboard, whose first real request 401'd and bounced straight back
      // to login — a flash of the app with no error ever shown. Only an
      // unreachable backend may use the directory.
      vi.stubEnv('VITE_ENABLE_DEMO_AUTH', 'true');
      postMock.mockRejectedValue(new ApiError(401, 'Invalid email or password'));
      const { useAuthStore } = await freshAuthStore();

      await expect(
        useAuthStore.getState().login('m.amin@amina-fzco.dj', DEMO_ACCOUNT_PASSWORD),
      ).rejects.toThrow(/incorrect email or password/i);

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
    });

    it('loginAsDemoPreset grants a session', async () => {
      vi.stubEnv('VITE_ENABLE_DEMO_AUTH', 'true');
      const { useAuthStore, DEMO_PRESETS } = await freshAuthStore();

      useAuthStore.getState().loginAsDemoPreset(requirePreset(DEMO_PRESETS, (p) => p.role === 'ADMIN'));

      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it('still prefers a real backend session when the backend succeeds', async () => {
      vi.stubEnv('VITE_ENABLE_DEMO_AUTH', 'true');
      postMock.mockResolvedValue({
        success: true,
        data: {
          user: {
            id: 'u-1',
            email: 'admin@fleetin.com',
            firstName: 'Real',
            lastName: 'User',
            role: 'ADMIN',
            permissions: ['users.view'],
          },
          accessToken: 'real-access-token',
          refreshToken: 'real-refresh-token',
        },
      });
      const { useAuthStore } = await freshAuthStore();

      await useAuthStore.getState().login('admin@fleetin.com', 'correct-password');

      expect(useAuthStore.getState().user?.permissions).toEqual(['users.view']);
    });
  });
});
