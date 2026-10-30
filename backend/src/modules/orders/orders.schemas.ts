import { z } from 'zod';
import { idSchema, mobileSchema, optionalText } from '../../validators/common.js';

const customizationEntry = z.object({
  fieldId: idSchema,
  value: z.string().trim().max(500),
});

export const orderItemInput = z.object({
  productId: idSchema,
  variantId: idSchema.optional().nullable().transform((v) => v || null),
  quantity: z.coerce.number({ error: 'الكمية غير صحيحة' }).int('الكمية يجب أن تكون عدداً صحيحاً').min(1, 'الكمية يجب أن تكون 1 على الأقل').max(1000, 'الكمية كبيرة جداً'),
  customization: z.array(customizationEntry).max(10).default([]),
  /** Free-text personalization note for products that allow customization */
  customNote: optionalText(300),
});

const optionalMobile = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .pipe(z.union([z.null(), mobileSchema]));

const orderBase = z.object({
    customer: z.object({
      name: z.string({ error: 'الاسم الكامل مطلوب' }).trim().min(3, 'يرجى كتابة الاسم الكامل').max(100),
      phone: mobileSchema,
    }),
    recipient: z
      .object({
        name: optionalText(100),
        phone: optionalMobile,
      })
      .optional()
      .nullable(),
    items: z.array(orderItemInput).min(1, 'السلة فارغة').max(50, 'عدد الأصناف في الطلب كبير جداً'),
    deliveryMethod: z.enum(['PICKUP', 'DELIVERY'], { error: 'يرجى اختيار طريقة الاستلام' }),
    deliveryAreaId: idSchema.optional().nullable(),
    deliveryAddress: optionalText(300),
    /** ISO date-time for a preferred pickup time; null/absent means as soon as it's ready. */
    pickupTime: z.iso.datetime({ offset: true, error: 'وقت الاستلام غير صحيح' }).optional().nullable(),
    paymentMethod: z.enum(['CASH', 'BANK_TRANSFER']).default('CASH'),
    notes: optionalText(1000),
  });

export const orderInputSchema = orderBase.superRefine((o, ctx) => {
  if (o.deliveryMethod === 'DELIVERY') {
    if (!o.deliveryAreaId) ctx.addIssue({ code: 'custom', path: ['deliveryAreaId'], message: 'يرجى اختيار منطقة التوصيل' });
    if (!o.deliveryAddress || o.deliveryAddress.length < 5) ctx.addIssue({ code: 'custom', path: ['deliveryAddress'], message: 'يرجى كتابة عنوان التوصيل بالتفصيل' });
  }
});

/** Checkout preview: only what affects the totals, so it works before the form is filled in. */
export const quoteInputSchema = orderBase.pick({ items: true, deliveryMethod: true, deliveryAreaId: true, pickupTime: true }).superRefine((o, ctx) => {
  if (o.deliveryMethod === 'DELIVERY' && !o.deliveryAreaId) ctx.addIssue({ code: 'custom', path: ['deliveryAreaId'], message: 'يرجى اختيار منطقة التوصيل' });
});

export const createOrderSchema = orderInputSchema.and(
  z.object({
    /** Client-generated per checkout attempt; retries with the same key return the same order. */
    idempotencyKey: z.string().trim().regex(/^[A-Za-z0-9-]{16,100}$/, 'مفتاح الطلب غير صالح').optional(),
  }),
);

export type OrderInput = z.infer<typeof orderInputSchema>;
export type QuoteInput = z.infer<typeof quoteInputSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
