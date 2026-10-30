import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireRole } from '../../middleware/auth.js';
import { ApiError, created, ok } from '../../utils/http.js';
import { idParams, idSchema } from '../../validators/common.js';
import { adjustStock } from '../inventory/inventory.service.js';
import {
  adminProductQuerySchema,
  createProduct,
  deleteProduct,
  getAdminProduct,
  listAdminProducts,
  listPublicProducts,
  productInclude,
  productInputSchema,
  publicProductQuerySchema,
  publicProductWhere,
  toPublicProduct,
  updateProduct,
} from './products.service.js';

// ---------- Public ----------
export const publicProductsRouter = Router();

publicProductsRouter.get('/', async (req, res) => {
  ok(res, await listPublicProducts(publicProductQuerySchema.parse(req.query)));
});

publicProductsRouter.get('/:slug', async (req, res) => {
  const slug = z.string().max(160).parse(req.params.slug);
  const product = await prisma.product.findFirst({ where: { ...publicProductWhere, slug }, include: productInclude });
  if (!product) throw ApiError.notFound('المنتج غير موجود أو غير متاح حالياً');

  const related = await prisma.product.findMany({
    where: { ...publicProductWhere, categoryId: product.categoryId, NOT: { id: product.id } },
    include: productInclude,
    orderBy: { createdAt: 'desc' },
    take: 4,
  });
  ok(res, { ...toPublicProduct(product), related: related.map(toPublicProduct) });
});

// ---------- Admin ----------
export const adminProductsRouter = Router();

adminProductsRouter.get('/', async (req, res) => {
  ok(res, await listAdminProducts(adminProductQuerySchema.parse(req.query)));
});

adminProductsRouter.post('/', requireRole('ADMIN'), async (req, res) => {
  const data = productInputSchema.parse(req.body);
  created(res, await createProduct(data, req.admin!.id), 'تمت إضافة المنتج');
});

adminProductsRouter.get('/:id', async (req, res) => {
  const { id } = idParams.parse(req.params);
  ok(res, await getAdminProduct(id));
});

adminProductsRouter.put('/:id', requireRole('ADMIN'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  const data = productInputSchema.parse(req.body);
  ok(res, await updateProduct(id, data, req.admin!.id), 'تم تحديث المنتج');
});

adminProductsRouter.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  const result = await deleteProduct(id);
  ok(res, result, result.archived ? 'تمت أرشفة المنتج لأنه مرتبط بطلبات سابقة' : 'تم حذف المنتج');
});

const statusSchema = z
  .object({ isActive: z.boolean().optional(), isFeatured: z.boolean().optional() })
  .refine((v) => v.isActive !== undefined || v.isFeatured !== undefined, { message: 'لا يوجد تغيير' });

adminProductsRouter.patch('/:id/status', requireRole('ADMIN'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  const data = statusSchema.parse(req.body);
  const exists = await prisma.product.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!exists) throw ApiError.notFound('المنتج غير موجود');
  await prisma.product.update({ where: { id }, data });
  ok(res, await getAdminProduct(id), 'تم تحديث حالة المنتج');
});

const stockSchema = z.object({
  variantId: idSchema.optional().nullable(),
  mode: z.enum(['set', 'adjust']),
  quantity: z.coerce.number().int().min(-1_000_000).max(1_000_000),
  reason: z.string().trim().min(2, 'يرجى كتابة سبب التعديل').max(300),
}).refine((v) => v.mode === 'adjust' || v.quantity >= 0, { message: 'الكمية لا يمكن أن تكون سالبة', path: ['quantity'] });

adminProductsRouter.patch('/:id/stock', requireRole('STAFF'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  const data = stockSchema.parse(req.body);
  const movement = await adjustStock({ productId: id, ...data, adminUserId: req.admin!.id });
  ok(res, { movement, product: await getAdminProduct(id) }, 'تم تحديث المخزون');
});
