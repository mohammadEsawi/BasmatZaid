import request from 'supertest';
import type { AdminRole } from '@prisma/client';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';
import { assertTestDatabase } from './global-setup.js';

export const app = createApp();
export { prisma };

export const ADMIN_PASSWORD = 'Test-Password-123';

/** Empties every table of the *test* database between tests. */
export async function resetDb() {
  assertTestDatabase();
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  }
}

export async function createAdmin(role: AdminRole = 'OWNER', email = `${role.toLowerCase()}@test.local`) {
  return prisma.adminUser.create({
    data: { email, username: role.toLowerCase(), name: `Test ${role}`, role, passwordHash: await hashPassword(ADMIN_PASSWORD) },
  });
}

/** Logged-in supertest agent plus the CSRF token required for writes. */
export async function loginAs(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/admin/auth/login').send({ identifier: email, password: ADMIN_PASSWORD });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, csrf: res.body.data.csrfToken as string };
}

export async function createCategory(name = 'جبصين', slug = 'gypsum') {
  return prisma.category.create({ data: { name, slug } });
}

export async function createProduct(categoryId: string, overrides: Partial<{ name: string; slug: string; price: string; discountPrice: string | null; stockQuantity: number; isActive: boolean }> = {}) {
  return prisma.product.create({
    data: {
      name: overrides.name ?? 'صينية جبصين دائرية',
      slug: overrides.slug ?? `p-${Math.random().toString(36).slice(2, 8)}`,
      categoryId,
      price: overrides.price ?? '15',
      discountPrice: overrides.discountPrice ?? null,
      stockQuantity: overrides.stockQuantity ?? 10,
      isActive: overrides.isActive ?? true,
    },
  });
}

export async function createArea(name = 'نابلس - رفيديا', deliveryFee = '10') {
  return prisma.deliveryArea.create({ data: { name, deliveryFee } });
}

export const customer = { name: 'أحمد محمد', phone: '0599123456' };

export function pickupOrder(items: { productId: string; variantId?: string; quantity: number; customization?: { fieldId: string; value: string }[] }[], extra: Record<string, unknown> = {}) {
  return { customer, items, deliveryMethod: 'PICKUP', ...extra };
}
