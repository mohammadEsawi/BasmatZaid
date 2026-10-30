import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middleware/auth.js';
import { loginLimiter } from '../../middleware/rateLimit.js';
import { ok } from '../../utils/http.js';
import { login, logout, SESSION_COOKIE, sessionCookieOptions } from './auth.service.js';

const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'اسم المستخدم أو البريد الإلكتروني مطلوب').max(200),
  password: z.string().min(1, 'كلمة المرور مطلوبة').max(200),
});

export const authRouter = Router();

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { identifier, password } = loginSchema.parse(req.body);
  const result = await login(identifier, password);
  res.cookie(SESSION_COOKIE, result.token, sessionCookieOptions(result.expiresAt));
  ok(res, { admin: result.admin, csrfToken: result.csrfToken, expiresAt: result.expiresAt }, 'تم تسجيل الدخول بنجاح');
});

authRouter.post('/logout', async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === 'string' && token) await logout(token);
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  ok(res, null, 'تم تسجيل الخروج');
});

authRouter.get('/me', requireAdmin, (req, res) => {
  ok(res, { admin: req.admin, csrfToken: req.adminSession!.csrfToken, expiresAt: req.adminSession!.expiresAt });
});
