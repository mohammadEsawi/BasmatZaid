import { z } from 'zod';
import { normalizeMobile } from '../utils/phone.js';

// Arabic default messages for every validation error that has no custom message.
z.config(z.locales.ar());

export const idSchema = z.string().trim().min(1).max(64);
export const idParams = z.object({ id: idSchema });

/** Money accepted as number or numeric string, max 2 decimals, stored as Decimal string. */
export const moneySchema = z
  .union([z.number(), z.string().trim()])
  .transform((v) => String(v))
  .refine((v) => /^\d{1,8}(\.\d{1,2})?$/.test(v), { message: 'المبلغ غير صحيح (رقم موجب بحد أقصى منزلتين عشريتين)' });

/** Variant price adjustments may be negative. */
export const signedMoneySchema = z
  .union([z.number(), z.string().trim()])
  .transform((v) => String(v))
  .refine((v) => /^-?\d{1,8}(\.\d{1,2})?$/.test(v), { message: 'قيمة فرق السعر غير صحيحة' });

export const mobileSchema = z
  .string({ error: 'رقم الهاتف مطلوب' })
  .trim()
  .min(1, 'رقم الهاتف مطلوب')
  .transform((v, ctx) => {
    const normalized = normalizeMobile(v);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'رقم الهاتف غير صحيح، مثال: 0599123456' });
      return z.NEVER;
    }
    return normalized;
  });

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const booleanQuery = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

/** Relative upload paths (/uploads/...) or absolute https URLs (e.g. Cloudinary). */
export const imageUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v.startsWith('/uploads/') || /^https:\/\/[^\s]+$/.test(v), { message: 'رابط الصورة غير صالح' });

export const sortDirSchema = z.enum(['asc', 'desc']).default('desc');
