import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const message = (text: string) => ({ success: false, message: text, errors: [] });

// Rate limits are relaxed in tests so suites can create many orders quickly.
const scale = env.isTest ? 1000 : 1;

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300 * scale,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: message('عدد الطلبات كبير جداً، يرجى المحاولة بعد قليل'),
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 50 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: message('محاولات دخول كثيرة، يرجى المحاولة بعد 15 دقيقة'),
});

export const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20 * scale,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: message('تم إرسال طلبات كثيرة، يرجى المحاولة لاحقاً أو التواصل معنا عبر واتساب'),
});

export const trackingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60 * scale,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: message('محاولات كثيرة، يرجى المحاولة لاحقاً'),
});
