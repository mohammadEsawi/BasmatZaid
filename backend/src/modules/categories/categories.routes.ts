import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireRole } from '../../middleware/auth.js';
import { ApiError, created, ok } from '../../utils/http.js';
import { randomSuffix, slugify } from '../../utils/slug.js';
import { idParams, imageUrlSchema, optionalText } from '../../validators/common.js';
import { listPublicProducts, publicProductQuerySchema } from '../products/products.service.js';

const categorySchema = z.object({
  name: z.string().trim().min(2, 'اسم التصنيف مطلوب').max(80),
  slug: z.string().trim().max(80).optional().nullable(),
  description: optionalText(500),
  image: imageUrlSchema.optional().nullable().transform((v) => v || null),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
});

async function uniqueSlug(base: string, excludeId?: string) {
  const slug = slugify(base) || `category-${randomSuffix()}`;
  const existing = await prisma.category.findFirst({ where: { slug, NOT: excludeId ? { id: excludeId } : undefined } });
  return existing ? `${slug}-${randomSuffix()}` : slug;
}

// ---------- Public ----------
export const publicCategoriesRouter = Router();

publicCategoriesRouter.get('/', async (_req, res) => {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: { where: { isActive: true, deletedAt: null } } } } },
  });
  ok(
    res,
    categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug, description: c.description, image: c.image, productCount: c._count.products })),
  );
});

publicCategoriesRouter.get('/:slug/products', async (req, res) => {
  const slug = z.string().max(120).parse(req.params.slug);
  const category = await prisma.category.findFirst({ where: { slug, isActive: true } });
  if (!category) throw ApiError.notFound('التصنيف غير موجود');
  const query = publicProductQuerySchema.parse({ ...req.query, category: slug });
  const products = await listPublicProducts(query);
  ok(res, { category: { id: category.id, name: category.name, slug: category.slug, description: category.description, image: category.image }, ...products });
});

// ---------- Admin ----------
export const adminCategoriesRouter = Router();

adminCategoriesRouter.get('/', async (_req, res) => {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: { where: { deletedAt: null } } } } },
  });
  ok(res, categories.map(({ _count, ...c }) => ({ ...c, productCount: _count.products })));
});

adminCategoriesRouter.post('/', requireRole('ADMIN'), async (req, res) => {
  const data = categorySchema.parse(req.body);
  const slug = await uniqueSlug(data.slug || data.name);
  const category = await prisma.category.create({ data: { ...data, slug } });
  created(res, category, 'تمت إضافة التصنيف');
});

adminCategoriesRouter.put('/:id', requireRole('ADMIN'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  const data = categorySchema.parse(req.body);
  const current = await prisma.category.findUnique({ where: { id } });
  if (!current) throw ApiError.notFound('التصنيف غير موجود');
  const slug = data.slug && slugify(data.slug) !== current.slug ? await uniqueSlug(data.slug, id) : current.slug;
  const category = await prisma.category.update({ where: { id }, data: { ...data, slug } });
  ok(res, category, 'تم تحديث التصنيف');
});

adminCategoriesRouter.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  const category = await prisma.category.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
  if (!category) throw ApiError.notFound('التصنيف غير موجود');
  if (category._count.products > 0) {
    throw ApiError.conflict('لا يمكن حذف تصنيف يحتوي على منتجات. انقل المنتجات لتصنيف آخر أو قم بإخفاء التصنيف بدلاً من حذفه', 'CATEGORY_NOT_EMPTY');
  }
  await prisma.category.delete({ where: { id } });
  ok(res, null, 'تم حذف التصنيف');
});
