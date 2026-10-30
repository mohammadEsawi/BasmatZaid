import 'dotenv/config';
import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  /** Comma-separated list of allowed frontend origins */
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  /** Number of reverse proxies in front of the app (for correct client IPs behind Nginx/Render/etc.) */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
  COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('lax'),
  COOKIE_SECURE: booleanString,
  COOKIE_DOMAIN: z.string().optional(),

  STORAGE_PROVIDER: z.enum(['local', 'cloudinary']).default('local'),
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(20).default(5),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_FOLDER: z.string().default('basmat-zaid'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

const raw = parsed.data;

if (raw.STORAGE_PROVIDER === 'cloudinary' && (!raw.CLOUDINARY_CLOUD_NAME || !raw.CLOUDINARY_API_KEY || !raw.CLOUDINARY_API_SECRET)) {
  console.error('STORAGE_PROVIDER=cloudinary requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET');
  process.exit(1);
}

const isProduction = raw.NODE_ENV === 'production';
const cookieSecure = raw.COOKIE_SECURE ?? isProduction;

if (raw.COOKIE_SAMESITE === 'none' && !cookieSecure) {
  console.error('COOKIE_SAMESITE=none requires secure cookies (COOKIE_SECURE=true)');
  process.exit(1);
}

export const env = {
  ...raw,
  isProduction,
  isTest: raw.NODE_ENV === 'test',
  cookieSecure,
  corsOrigins: raw.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
  maxUploadBytes: Math.round(raw.MAX_UPLOAD_MB * 1024 * 1024),
};
