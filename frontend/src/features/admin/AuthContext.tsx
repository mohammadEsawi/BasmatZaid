import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { setCsrfToken, setUnauthorizedHandler } from '@/services/api';
import { adminApi } from '@/services/admin';
import { Spinner } from '@/components/ui/misc';
import type { AdminRole, AdminUser } from '@/types';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  admin: AdminUser | null;
  status: Status;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (minimum: AdminRole) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const RANK: Record<AdminRole, number> = { STAFF: 1, ADMIN: 2, OWNER: 3 };

/**
 * Session state for the admin area. The HTTP-only cookie is the real credential and the
 * backend checks it on every request — this context only mirrors it for the UI.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const queryClient = useQueryClient();

  const reset = useCallback(() => {
    setCsrfToken(null);
    setAdmin(null);
    setStatus('anonymous');
    queryClient.removeQueries({ queryKey: ['admin'] });
  }, [queryClient]);

  useEffect(() => {
    adminApi
      .me()
      .then((s) => {
        setCsrfToken(s.csrfToken);
        setAdmin(s.admin);
        setStatus('authenticated');
      })
      .catch(reset);
  }, [reset]);

  useEffect(() => {
    setUnauthorizedHandler(reset);
    return () => setUnauthorizedHandler(null);
  }, [reset]);

  const login = useCallback(async (identifier: string, password: string) => {
    const s = await adminApi.login(identifier, password);
    setCsrfToken(s.csrfToken);
    setAdmin(s.admin);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await adminApi.logout();
    } finally {
      reset();
    }
  }, [reset]);

  const value = useMemo<AuthContextValue>(
    () => ({ admin, status, login, logout, can: (min) => !!admin && RANK[admin.role] >= RANK[min] }),
    [admin, status, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Route guard for /admin/*. */
export function RequireAdmin() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ivory">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (status === 'anonymous') return <Navigate to="/admin/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}
