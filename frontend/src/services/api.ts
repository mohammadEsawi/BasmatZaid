const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export interface FieldError {
  path: string;
  message: string;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly errors: FieldError[] = [],
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export interface ApiResponse<T> {
  data: T;
  message: string;
}

// The CSRF token lives only in memory; it is re-fetched from /auth/me after a reload.
let csrfToken: string | null = null;
export const setCsrfToken = (token: string | null) => {
  csrfToken = token;
};

type Query = Record<string, string | number | boolean | null | undefined>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  form?: FormData;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: Query) {
  const url = `${API_BASE}/api${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

let onUnauthorized: (() => void) | null = null;
/** Lets the admin auth context react when a session expires mid-use. */
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

export async function apiRequest<T>(path: string, { method = 'GET', body, query, form, signal }: RequestOptions = {}): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
      credentials: 'include',
      signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiRequestError('تعذر الاتصال بالخادم، تأكد من اتصالك بالإنترنت وحاول مرة أخرى', 0, 'NETWORK_ERROR');
  }

  let payload: { success?: boolean; data?: T; message?: string; code?: string; errors?: FieldError[] } = {};
  try {
    payload = await response.json();
  } catch {
    // Non-JSON response (e.g. proxy error page)
  }

  if (!response.ok || payload.success === false) {
    if (response.status === 401 && path.startsWith('/admin') && !path.startsWith('/admin/auth/login')) onUnauthorized?.();
    const fallback = response.status >= 500 ? 'حدث خطأ في الخادم، يرجى المحاولة لاحقاً' : 'تعذر تنفيذ الطلب';
    throw new ApiRequestError(payload.message || fallback, response.status, payload.code, payload.errors ?? []);
  }
  return { data: payload.data as T, message: payload.message ?? '' };
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => apiRequest<T>(path, { query, signal }).then((r) => r.data),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, form: FormData) => apiRequest<T>(path, { method: 'POST', form }),
};

/** Resolves locally stored images (/uploads/...) against the API host. */
export function assetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith('/uploads/') ? `${API_BASE}${url}` : url;
}

export function errorMessage(error: unknown, fallback = 'حدث خطأ غير متوقع'): string {
  if (error instanceof ApiRequestError) return error.message;
  return fallback;
}
