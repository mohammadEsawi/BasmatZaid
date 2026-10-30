import { z } from 'zod';

// Local mobile numbers: 059..., 056..., also accepts +970 / +972 prefixes and Arabic digits.
const ARABIC_DIGITS = /[٠-٩]/g;
export const normalizeDigits = (v: string) => v.replace(ARABIC_DIGITS, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
const MOBILE = /^(?:\+?97[02]|0)?5\d{8}$/;
const isMobile = (v: string) => MOBILE.test(normalizeDigits(v).replace(/[\s-]/g, '').replace(/^00/, '+'));

export const checkoutSchema = z
  .object({
    name: z.string().trim().min(3, 'يرجى كتابة الاسم الكامل').max(100, 'الاسم طويل جداً'),
    phone: z.string().trim().min(1, 'رقم الهاتف مطلوب').refine(isMobile, 'رقم الهاتف غير صحيح، مثال: 0599123456'),
    differentRecipient: z.boolean(),
    recipientName: z.string().trim().max(100).optional(),
    recipientPhone: z.string().trim().optional(),
    deliveryMethod: z.enum(['PICKUP', 'DELIVERY'], { error: 'يرجى اختيار طريقة الاستلام' }),
    pickupWhen: z.enum(['asap', 'scheduled']),
    pickupTime: z.string().optional(),
    deliveryAreaId: z.string().optional(),
    deliveryAddress: z.string().trim().max(300, 'العنوان طويل جداً').optional(),
    notes: z.string().trim().max(1000, 'الملاحظات طويلة جداً').optional(),
  })
  .superRefine((v, ctx) => {
    if (v.differentRecipient) {
      if (!v.recipientName || v.recipientName.length < 2) ctx.addIssue({ code: 'custom', path: ['recipientName'], message: 'يرجى كتابة اسم المستلم' });
      if (v.recipientPhone && !isMobile(v.recipientPhone)) ctx.addIssue({ code: 'custom', path: ['recipientPhone'], message: 'رقم هاتف المستلم غير صحيح' });
    }
    if (v.deliveryMethod === 'DELIVERY') {
      if (!v.deliveryAreaId) ctx.addIssue({ code: 'custom', path: ['deliveryAreaId'], message: 'يرجى اختيار منطقة التوصيل' });
      if (!v.deliveryAddress || v.deliveryAddress.length < 5) ctx.addIssue({ code: 'custom', path: ['deliveryAddress'], message: 'يرجى كتابة عنوان التوصيل بالتفصيل (المدينة، الحي، الشارع)' });
    }
    if (v.deliveryMethod === 'PICKUP' && v.pickupWhen === 'scheduled') {
      const t = v.pickupTime ? new Date(v.pickupTime).getTime() : NaN;
      if (Number.isNaN(t)) ctx.addIssue({ code: 'custom', path: ['pickupTime'], message: 'يرجى اختيار وقت الاستلام' });
      else if (t < Date.now()) ctx.addIssue({ code: 'custom', path: ['pickupTime'], message: 'وقت الاستلام يجب أن يكون في المستقبل' });
    }
  });

export type CheckoutValues = z.infer<typeof checkoutSchema>;
