import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireRole } from '../../middleware/auth.js';
import { orderLimiter, trackingLimiter } from '../../middleware/rateLimit.js';
import { ApiError, created, ok } from '../../utils/http.js';
import { moneyString, unitPriceFor } from '../../utils/money.js';
import { paginate, paged, paginationSchema } from '../../utils/pagination.js';
import { normalizeMobile } from '../../utils/phone.js';
import { safeEqual } from '../auth/auth.service.js';
import { getSettings } from '../settings/settings.service.js';
import { idParams, optionalText } from '../../validators/common.js';
import { createOrderSchema, quoteInputSchema } from './orders.schemas.js';
import { changeOrderStatus, createOrder, getAdminOrder, orderInclude, quoteOrder, STATUS_LABELS, toCustomerOrder } from './orders.service.js';

// ---------- Public ----------
export const publicOrdersRouter = Router();

publicOrdersRouter.post('/quote', orderLimiter, async (req, res) => {
  const input = quoteInputSchema.parse(req.body);
  ok(res, await quoteOrder(input), 'تم حساب المجموع');
});

const cartCheckSchema = z.object({
  items: z.array(z.object({ productId: z.string().max(64), variantId: z.string().max(64).nullable().optional() })).max(50),
});

/**
 * Lets the cart refresh current prices and stock for its lines (informational only —
 * the order endpoint re-validates everything).
 */
publicOrdersRouter.post('/cart-check', async (req, res) => {
  const { items } = cartCheckSchema.parse(req.body);
  const products = await prisma.product.findMany({
    where: { id: { in: [...new Set(items.map((i) => i.productId))] } },
    include: { variants: true, category: { select: { isActive: true } } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  ok(
    res,
    items.map((item) => {
      const p = byId.get(item.productId);
      const base = { productId: item.productId, variantId: item.variantId ?? null };
      if (!p || p.deletedAt || !p.isActive || !p.category.isActive) return { ...base, orderable: false, stockQuantity: 0, unitPrice: null, message: 'المنتج لم يعد متوفراً' };
      const activeVariants = p.variants.filter((v) => v.isActive);
      const variant = item.variantId ? activeVariants.find((v) => v.id === item.variantId) : null;
      if (activeVariants.length > 0 && !variant) return { ...base, orderable: false, stockQuantity: 0, unitPrice: null, message: 'الخيار المختار لم يعد متوفراً' };
      const stock = variant ? variant.stockQuantity : p.stockQuantity;
      return {
        ...base,
        orderable: stock > 0,
        stockQuantity: stock,
        unitPrice: moneyString(unitPriceFor(p.price, p.discountPrice, variant?.priceAdjustment ?? null)),
        message: stock > 0 ? null : 'نفد من المخزون',
      };
    }),
  );
});

publicOrdersRouter.post('/', orderLimiter, async (req, res) => {
  const input = createOrderSchema.parse(req.body);
  const { order, duplicate } = await createOrder(input);
  const data = toCustomerOrder(order, await getSettings());
  if (duplicate) return ok(res, data, 'تم استلام هذا الطلب مسبقاً');
  created(res, data, 'تم استلام طلبك بنجاح!');
});

const trackQuery = z.object({
  token: z.string().max(100).optional(),
  phone: z.string().max(30).optional(),
});

/**
 * Customers can view only their own order: with the secret tracking token returned at
 * checkout, or by order number + the phone number used on the order.
 */
publicOrdersRouter.get('/track/:orderNumber', trackingLimiter, async (req, res) => {
  const orderNumber = z.string().trim().toUpperCase().max(30).parse(req.params.orderNumber);
  const { token, phone } = trackQuery.parse(req.query);
  if (!token && !phone) throw ApiError.badRequest('يرجى إدخال رقم الهاتف المستخدم في الطلب');

  const order = await prisma.order.findUnique({ where: { orderNumber }, include: orderInclude });
  const notFound = ApiError.notFound('لم يتم العثور على طلب بهذه البيانات');
  if (!order) throw notFound;

  const verified = token ? safeEqual(token, order.trackingToken) : normalizeMobile(phone!) === order.customerPhoneSnapshot;
  if (!verified) throw notFound;

  ok(res, toCustomerOrder(order, await getSettings()));
});

// ---------- Admin ----------
export const adminOrdersRouter = Router();

const listQuery = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED']).optional(),
  deliveryMethod: z.enum(['PICKUP', 'DELIVERY']).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  sort: z.enum(['newest', 'oldest', 'total_desc', 'total_asc']).default('newest'),
});

/** Interprets a YYYY-MM-DD date as a whole local day in Palestine (UTC+2 or +3 depending on DST). */
function dayBoundary(date: string, end: boolean) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Hebron', timeZoneName: 'longOffset' }).formatToParts(new Date(`${date}T12:00:00Z`));
  const offset = parts.find((p) => p.type === 'timeZoneName')?.value.replace('GMT', '') || '+02:00';
  const d = new Date(`${date}T00:00:00${offset}`);
  if (end) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

adminOrdersRouter.get('/', async (req, res) => {
  const q = listQuery.parse(req.query);
  const where: Prisma.OrderWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.deliveryMethod ? { deliveryMethod: q.deliveryMethod } : {}),
    ...(q.from || q.to
      ? { createdAt: { ...(q.from ? { gte: dayBoundary(q.from, false) } : {}), ...(q.to ? { lt: dayBoundary(q.to, true) } : {}) } }
      : {}),
    ...(q.search
      ? {
          OR: [
            { orderNumber: { contains: q.search, mode: 'insensitive' } },
            { customerNameSnapshot: { contains: q.search, mode: 'insensitive' } },
            { customerPhoneSnapshot: { contains: normalizeMobile(q.search) ?? q.search } },
          ],
        }
      : {}),
  };
  const orderBy: Prisma.OrderOrderByWithRelationInput = {
    newest: { createdAt: 'desc' as const },
    oldest: { createdAt: 'asc' as const },
    total_desc: { total: 'desc' as const },
    total_asc: { total: 'asc' as const },
  }[q.sort];

  const [orders, total, statusCounts] = await Promise.all([
    prisma.order.findMany({ where, orderBy, ...paginate(q.page, q.pageSize), include: { _count: { select: { items: true } } } }),
    prisma.order.count({ where }),
    prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  ok(res, {
    ...paged(
      orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        createdAt: o.createdAt,
        customerName: o.customerNameSnapshot,
        customerPhone: o.customerPhoneSnapshot,
        deliveryMethod: o.deliveryMethod,
        deliveryArea: o.deliveryArea,
        itemsCount: o._count.items,
        totalQuantity: o.totalQuantity,
        total: moneyString(o.total),
        status: o.status,
        statusLabel: STATUS_LABELS[o.status],
        paymentStatus: o.paymentStatus,
      })),
      total,
      q.page,
      q.pageSize,
    ),
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all])),
  });
});

adminOrdersRouter.get('/:id', async (req, res) => {
  const { id } = idParams.parse(req.params);
  ok(res, await getAdminOrder(id));
});

const statusSchema = z.object({
  status: z.enum(['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED']),
  note: optionalText(500),
});

adminOrdersRouter.patch('/:id/status', requireRole('STAFF'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { status, note } = statusSchema.parse(req.body);
  const { stockRestored } = await changeOrderStatus({ orderId: id, status, note, adminUserId: req.admin!.id });
  const message = status === 'CANCELLED' && stockRestored ? 'تم إلغاء الطلب وإرجاع الكميات للمخزون' : `تم تغيير حالة الطلب إلى "${STATUS_LABELS[status]}"`;
  ok(res, await getAdminOrder(id), message);
});

const notesSchema = z.object({ adminNotes: optionalText(3000) });

adminOrdersRouter.patch('/:id/notes', requireRole('STAFF'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { adminNotes } = notesSchema.parse(req.body);
  await prisma.order.update({ where: { id }, data: { adminNotes } });
  ok(res, await getAdminOrder(id), 'تم حفظ الملاحظات');
});

const paymentSchema = z.object({ paymentStatus: z.enum(['UNPAID', 'PAID', 'REFUNDED']) });

adminOrdersRouter.patch('/:id/payment', requireRole('STAFF'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { paymentStatus } = paymentSchema.parse(req.body);
  await prisma.order.update({ where: { id }, data: { paymentStatus } });
  ok(res, await getAdminOrder(id), 'تم تحديث حالة الدفع');
});
