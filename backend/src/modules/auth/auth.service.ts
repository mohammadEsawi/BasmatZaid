import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import type { AdminRole } from '@prisma/client';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/http.js';

export const SESSION_COOKIE = 'bz_admin_session';

export interface AuthenticatedAdmin {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: AdminRole;
}

// OWASP-recommended argon2id parameters (19 MiB memory, 2 iterations).
const ARGON_OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { ...ARGON_OPTIONS, raw: false });
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 12) return 'كلمة المرور يجب أن تكون 12 حرفاً على الأقل';
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'كلمة المرور يجب أن تحتوي على أحرف وأرقام';
  return null;
}

// Verifying against a dummy hash when the user doesn't exist keeps response timing uniform.
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHash;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function toAuthenticated(admin: { id: string; name: string; email: string; username: string | null; role: AdminRole }): AuthenticatedAdmin {
  return { id: admin.id, name: admin.name, email: admin.email, username: admin.username, role: admin.role };
}

export async function login(identifier: string, password: string) {
  const normalized = identifier.trim().toLowerCase();
  const admin = await prisma.adminUser.findFirst({
    where: { OR: [{ email: normalized }, { username: normalized }] },
  });

  if (!admin) {
    await argon2.verify(await getDummyHash(), password).catch(() => false);
    throw ApiError.unauthorized('بيانات الدخول غير صحيحة');
  }

  const valid = await argon2.verify(admin.passwordHash, password).catch(() => false);
  if (!valid || !admin.isActive) throw ApiError.unauthorized('بيانات الدخول غير صحيحة');

  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.adminSession.create({ data: { tokenHash: sha256(token), csrfToken, adminUserId: admin.id, expiresAt } }),
    prisma.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } }),
    // Housekeeping: drop this admin's expired sessions.
    prisma.adminSession.deleteMany({ where: { adminUserId: admin.id, expiresAt: { lt: new Date() } } }),
  ]);

  return { token, csrfToken, expiresAt, admin: toAuthenticated(admin) };
}

export async function getSessionByToken(token: string) {
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: sha256(token) },
    include: { adminUser: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date() || !session.adminUser.isActive) {
    await prisma.adminSession.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return { id: session.id, csrfToken: session.csrfToken, expiresAt: session.expiresAt, admin: toAuthenticated(session.adminUser) };
}

export async function logout(token: string) {
  await prisma.adminSession.deleteMany({ where: { tokenHash: sha256(token) } });
}

export function sessionCookieOptions(expiresAt?: Date) {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.COOKIE_SAMESITE,
    domain: env.COOKIE_DOMAIN || undefined,
    path: '/api',
    ...(expiresAt ? { expires: expiresAt } : {}),
  } as const;
}
