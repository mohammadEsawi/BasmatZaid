import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { cleanPhone } from '../../utils/phone.js';

const text = (max: number, fallback = '') => z.string().trim().max(max).default(fallback);
const url = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^https:\/\/\S+$/.test(v), { message: 'يجب أن يبدأ الرابط بـ https://' })
  .default('');
const image = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || v.startsWith('/uploads/') || /^https:\/\/\S+$/.test(v), { message: 'رابط الصورة غير صالح' })
  .default('');

/** International digits only, e.g. 970599123456. Empty means "not configured yet". */
const whatsappNumber = z
  .string()
  .trim()
  .transform((v) => cleanPhone(v).replace(/^\+/, '').replace(/^00/, ''))
  .refine((v) => v === '' || /^[1-9]\d{7,14}$/.test(v), { message: 'رقم واتساب يجب أن يكون بالصيغة الدولية بدون + مثل 970599123456' })
  .default('');

export const settingsSchemas = {
  business: z.object({
    nameAr: text(100, 'بصمة زيد'),
    nameEn: text(100, 'Basmat Zaid'),
    logoUrl: image,
    phone: text(30),
    whatsappNumber,
    /** Used to convert local customer numbers (05...) for WhatsApp links */
    defaultCountryCode: z.string().trim().regex(/^\d{1,4}$/, 'رمز الدولة غير صحيح').default('970'),
    address: text(300),
    description: text(1000, 'قطع جبصين مصنوعة يدوياً بحب، توزيعات وهدايا وقوالب مخصصة لكل مناسباتكم.'),
  }),
  social: z.object({
    instagram: url,
    facebook: url,
    tiktok: url,
    whatsapp: url,
  }),
  content: z.object({
    heroTitle: text(150, 'لمسة يدوية تبقى ذكرى'),
    heroSubtitle: text(500, 'قطع جبصين وديكورات وتوزيعات مناسبات مصنوعة يدوياً بعناية، ومخصصة على ذوقك.'),
    heroImage: image,
    aboutTitle: text(150, 'عن بصمة زيد'),
    aboutText: text(3000, 'بصمة زيد مشروع منزلي فلسطيني لصناعة قطع الجبصين اليدوية، التوزيعات، الهدايا والقوالب. كل قطعة تُصنع بإيدينا بكل حب وتفاصيل، لتكون جزءاً من فرحتكم.'),
    footerText: text(500, 'صُنع يدوياً بحب في فلسطين 🤍'),
    showFeatured: z.boolean().default(true),
    showLatest: z.boolean().default(true),
  }),
  store: z.object({
    currency: z.literal('ILS').default('ILS'),
    storeOpen: z.boolean().default(true),
    acceptingOrders: z.boolean().default(true),
    closedMessage: text(300, 'المتجر لا يستقبل طلبات حالياً، تواصلوا معنا عبر واتساب.'),
    defaultLowStockThreshold: z.number().int().min(0).max(1000).default(5),
  }),
  delivery: z.object({
    pickupEnabled: z.boolean().default(true),
    deliveryEnabled: z.boolean().default(true),
    pickupLocation: text(300),
    pickupInstructions: text(1000),
    estimatedPickupTime: text(150, 'خلال 1-3 أيام عمل'),
    estimatedDeliveryTime: text(150, 'خلال 2-4 أيام عمل'),
    /** Minimum products subtotal for delivery orders, as a decimal string. Empty = no minimum. */
    minOrderAmount: z
      .union([z.string(), z.number()])
      .transform((v) => String(v).trim())
      .refine((v) => v === '' || /^\d{1,8}(\.\d{1,2})?$/.test(v), { message: 'الحد الأدنى للطلب غير صحيح' })
      .default(''),
  }),
};

export type SettingsKey = keyof typeof settingsSchemas;
export type Settings = { [K in SettingsKey]: z.infer<(typeof settingsSchemas)[K]> };
export const SETTINGS_KEYS = Object.keys(settingsSchemas) as SettingsKey[];

/** Reads all settings and fills in defaults for anything not yet saved. */
export async function getSettings(): Promise<Settings> {
  const rows = await prisma.storeSettings.findMany({ where: { key: { in: SETTINGS_KEYS } } });
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const result = {} as Record<SettingsKey, unknown>;
  for (const key of SETTINGS_KEYS) {
    const value = stored.get(key);
    const parsed = settingsSchemas[key].safeParse(value && typeof value === 'object' ? value : {});
    result[key] = parsed.success ? parsed.data : settingsSchemas[key].parse({});
  }
  return result as Settings;
}

// Each group is a raw partial object; it is validated after merging with the stored values,
// so omitted fields keep their current value instead of being reset to defaults.
const partialGroup = z.record(z.string(), z.unknown()).optional();
export const updateSettingsSchema = z
  .object({
    business: partialGroup,
    social: partialGroup,
    content: partialGroup,
    store: partialGroup,
    delivery: partialGroup,
  })
  .strict();

/** Merges a partial update into each group and validates the full result before saving. */
export async function updateSettings(input: z.infer<typeof updateSettingsSchema>) {
  const current = await getSettings();
  await prisma.$transaction(
    SETTINGS_KEYS.filter((key) => input[key]).map((key) => {
      const merged = settingsSchemas[key].parse({ ...current[key], ...stripUndefined(input[key]!) });
      return prisma.storeSettings.upsert({
        where: { key },
        create: { key, value: merged },
        update: { value: merged },
      });
    }),
  );
  return getSettings();
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Only the settings that are safe to expose on the public storefront. */
export function toPublicSettings(s: Settings) {
  return {
    business: {
      nameAr: s.business.nameAr,
      nameEn: s.business.nameEn,
      logoUrl: s.business.logoUrl,
      phone: s.business.phone,
      whatsappNumber: s.business.whatsappNumber,
      address: s.business.address,
      description: s.business.description,
    },
    social: s.social,
    content: s.content,
    store: {
      currency: s.store.currency,
      storeOpen: s.store.storeOpen,
      acceptingOrders: s.store.acceptingOrders,
      closedMessage: s.store.closedMessage,
    },
    delivery: s.delivery,
  };
}
