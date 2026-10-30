import type { RequestHandler } from 'express';
import type { AdminRole } from '@prisma/client';
import { ApiError } from '../utils/http.js';
import { getSessionByToken, safeEqual, SESSION_COOKIE, type AuthenticatedAdmin } from '../modules/auth/auth.service.js';

declare module 'express-serve-static-core' {
  interface Request {
    admin?: AuthenticatedAdmin;
    adminSession?: { id: string; csrfToken: string; expiresAt: Date };
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Verifies the HTTP-only session cookie on every admin request (server-side, never frontend-only). */
export const requireAdmin: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string' || !token) throw ApiError.unauthorized();

  const session = await getSessionByToken(token);
  if (!session) throw ApiError.unauthorized('انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى');

  req.admin = session.admin;
  req.adminSession = { id: session.id, csrfToken: session.csrfToken, expiresAt: session.expiresAt };
  next();
};

/**
 * CSRF protection: state-changing admin requests must echo the per-session token
 * (returned by login and /auth/me) in the X-CSRF-Token header. A cross-site page can
 * send the cookie but can never read this token.
 */
export const requireCsrf: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const header = req.get('x-csrf-token');
  if (!header || !req.adminSession || !safeEqual(header, req.adminSession.csrfToken)) {
    throw ApiError.forbidden('رمز الحماية غير صالح، يرجى تحديث الصفحة والمحاولة مجدداً');
  }
  next();
};

const ROLE_RANK: Record<AdminRole, number> = { STAFF: 1, ADMIN: 2, OWNER: 3 };

/** Allows the request only if the admin's role is at least `minimum`. */
export function requireRole(minimum: AdminRole): RequestHandler {
  return (req, _res, next) => {
    if (!req.admin) throw ApiError.unauthorized();
    if (ROLE_RANK[req.admin.role] < ROLE_RANK[minimum]) throw ApiError.forbidden();
    next();
  };
}
