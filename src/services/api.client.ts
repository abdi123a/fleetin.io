/**
 * Central API HTTP Client for FLEETIN Backend
 */

import { useAuthStore } from '@/stores/auth.store';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
  timestamp?: string;
}

/**
 * Uploaded files (logos, documents) come back as host-relative paths like
 * `/uploads/logos/….png` — served by the API host, not by whatever origin the
 * app itself is running on. In dev those differ (5173 vs 3000), so an `<img
 * src>` straight from the API would 404 against Vite. Absolute URLs (S3
 * presigned) pass through untouched.
 */
export function resolveAssetUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^(https?:)?\/\//.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return url;
  return `${new URL(API_BASE_URL, window.location.origin).origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * Thrown for any non-2xx response. Carries the HTTP status so
 * `lib/queryClient.ts`'s retry policy can tell a 4xx (never retry) from a 5xx
 * (retry) — before this existed every thrown error was a plain `Error` with
 * no `.status`, so that retry-suppression logic was silently dead.
 */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

/**
 * Access tokens live 15 minutes (`JWT_EXPIRES_IN`); without this, every page
 * open for longer than that started throwing silent 401s that every caller
 * rendered as "0 results" / "not found" instead of a session error. Shared
 * as a module-level promise so N concurrent 401s (a page firing several
 * queries at once) trigger exactly one rotation — the backend treats a
 * *second* use of the same refresh token as theft and revokes the whole
 * session (see `RefreshTokenService.handleReuse`), so callers must await the
 * same in-flight refresh rather than each rotating it themselves.
 */
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = useAuthStore.getState().refreshToken;
    if (!refreshToken) return null;

    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) return null;

      const body = (await response.json()) as ApiResponse<RefreshResponse>;
      useAuthStore.setState({ accessToken: body.data.accessToken, refreshToken: body.data.refreshToken });
      return body.data.accessToken;
    } catch {
      return null;
    }
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

/** The session is unrecoverable — clear it and send the user back to log in rather than leave every page silently empty. */
function sessionExpired() {
  useAuthStore.getState().logout();
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

class ApiClient {
  private authHeader(token?: string | null): HeadersInit {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private jsonHeaders(token?: string | null): HeadersInit {
    return { 'Content-Type': 'application/json', ...this.authHeader(token) };
  }

  /**
   * Every request funnels through here so the 401-refresh-retry logic lives
   * in exactly one place. `/auth/*` requests (login, refresh itself) are
   * exempt — a wrong-password 401 on login must surface as a login error,
   * not trigger a refresh attempt and redirect away from the login page.
   */
  private async fetchWithAuth(
    endpoint: string,
    init: RequestInit,
    token: string | null | undefined,
    buildHeaders: (token?: string | null) => HeadersInit,
  ): Promise<Response> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...init, headers: buildHeaders(token) });
    if (response.status !== 401 || endpoint.startsWith('/auth/')) return response;

    const newToken = await refreshAccessToken();
    if (!newToken) {
      sessionExpired();
      return response;
    }
    return fetch(`${API_BASE_URL}${endpoint}`, { ...init, headers: buildHeaders(newToken) });
  }

  private async handle<T>(response: Response): Promise<ApiResponse<T>> {
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(response.status, errorData.message || `HTTP ${response.status}: Request failed`);
    }
    return response.json();
  }

  async get<T>(endpoint: string, token?: string | null): Promise<ApiResponse<T>> {
    const response = await this.fetchWithAuth(endpoint, { method: 'GET' }, token, (t) => this.jsonHeaders(t));
    return this.handle<T>(response);
  }

  async post<T>(endpoint: string, body: unknown, token?: string | null): Promise<ApiResponse<T>> {
    const response = await this.fetchWithAuth(
      endpoint,
      { method: 'POST', body: JSON.stringify(body) },
      token,
      (t) => this.jsonHeaders(t),
    );
    return this.handle<T>(response);
  }

  async patch<T>(endpoint: string, body: unknown, token?: string | null): Promise<ApiResponse<T>> {
    const response = await this.fetchWithAuth(
      endpoint,
      { method: 'PATCH', body: JSON.stringify(body) },
      token,
      (t) => this.jsonHeaders(t),
    );
    return this.handle<T>(response);
  }

  async put<T>(endpoint: string, body: unknown, token?: string | null): Promise<ApiResponse<T>> {
    const response = await this.fetchWithAuth(
      endpoint,
      { method: 'PUT', body: JSON.stringify(body) },
      token,
      (t) => this.jsonHeaders(t),
    );
    return this.handle<T>(response);
  }

  async delete<T>(endpoint: string, token?: string | null): Promise<ApiResponse<T>> {
    const response = await this.fetchWithAuth(endpoint, { method: 'DELETE' }, token, (t) => this.jsonHeaders(t));
    return this.handle<T>(response);
  }

  /**
   * Multipart upload. No `Content-Type` header is set here — the browser
   * derives the correct `multipart/form-data; boundary=...` value from the
   * `FormData` body, and setting it manually breaks the boundary.
   */
  async upload<T>(endpoint: string, form: FormData, token?: string | null): Promise<ApiResponse<T>> {
    const response = await this.fetchWithAuth(endpoint, { method: 'POST', body: form }, token, (t) => this.authHeader(t));
    return this.handle<T>(response);
  }

  /** For binary responses (document download) — bypasses the JSON envelope entirely. */
  async downloadBlob(endpoint: string, token?: string | null): Promise<{ blob: Blob; filename: string | null }> {
    const response = await this.fetchWithAuth(endpoint, { method: 'GET' }, token, (t) => this.authHeader(t));
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(response.status, errorData.message || `HTTP ${response.status}: Request failed`);
    }
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const match = /filename="([^"]+)"/.exec(disposition);
    return { blob: await response.blob(), filename: match?.[1] ?? null };
  }
}

export const apiClient = new ApiClient();
