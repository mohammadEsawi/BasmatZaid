import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireRole } from '../../middleware/auth.js';
import { ApiError, created, ok } from '../../utils/http.js';
import { moneyString } from '../../utils/money.js';
import { idParams, moneySchema, optionalText } from '../../validators/common.js';

const areaSchema = z.object({
  name: z.string().trim().min(2, 'اسم المنطقة مطلوب').max(120),
  deliveryFee: moneySchema,
  isActive: z.boolean().default(true),
  estimatedDeliveryTime: optionalText(120),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
});

const serialize = (a: Awaited<ReturnType<typeof prisma.deliveryArea.findFirstOrThrow>>) => ({ ...a, deliveryFee: moneyString(a.deliveryFee) });

export const adminDeliveryRouter = Router();

adminDeliveryRouter.get('/', async (_req, res) => {
  const areas = await prisma.deliveryArea.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  ok(res, areas.map(serialize));
});

adminDeliveryRouter.post('/', requireRole('ADMIN'), async (req, res) => {
  const data = areaSchema.parse(req.body);
  created(res, serialize(await prisma.deliveryArea.create({ data })), 'تمت إضافة منطقة التوصيل');
});

adminDeliveryRouter.put('/:id', requireRole('ADMIN'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  const data = areaSchema.parse(req.body);
  const exists = await prisma.deliveryArea.findUnique({ where: { id } });
  if (!exists) throw ApiError.notFound('منطقة التوصيل غير موجودة');
  ok(res, serialize(await prisma.deliveryArea.update({ where: { id }, data })), 'تم تحديث منطقة التوصيل');
});

// Past orders keep the area name and fee as snapshots, so deleting an area is safe.
adminDeliveryRouter.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  const exists = await prisma.deliveryArea.findUnique({ where: { id } });
  if (!exists) throw ApiError.notFound('منطقة التوصيل غير موجودة');
  await prisma.deliveryArea.delete({ where: { id } });
  ok(res, null, 'تم حذف منطقة التوصيل');
});
