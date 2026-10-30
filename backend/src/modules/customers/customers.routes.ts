import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireRole } from '../../middleware/auth.js';
import { ApiError, ok } from '../../utils/http.js';
import { moneyString, ZERO } from '../../utils/money.js';
import { paginate, paged, paginationSchema } from '../../utils/pagination.js';
import { normalizeMobile, toWhatsAppNumber } from '../../utils/phone.js';
import { getSettings } from '../settings/settings.service.js';
import { idParams, optionalText } from '../../validators/common.js';
import { STATUS_LABELS } from '../orders/orders.service.js';

export const adminCustomersRouter = Router();

/** Spending excludes cancelled orders. */
async function customerStats(customerIds: string[]) {
  const [spending, lastOrders] = await Promise.all([
    prisma.order.groupBy({ by: ['customerId'], where: { customerId: { in: customerIds }, status: { not: 'CANCELLED' } }, _sum: { total: true } }),
    prisma.order.groupBy({ by: ['customerId'], where: { customerId: { in: customerIds } }, _max: { createdAt: true }, _count: { _all: true } }),
  ]);
  const spent = new Map(spending.map((s) => [s.customerId, s._sum.total ?? ZERO]));
  const last = new Map(lastOrders.map((s) => [s.customerId, { lastOrderAt: s._max.createdAt, ordersCount: s._count._all }]));
  return (id: string) => ({
    ordersCount: last.get(id)?.ordersCount ?? 0,
    totalSpent: moneyString(spent.get(id) ?? ZERO),
    lastOrderAt: last.get(id)?.lastOrderAt ?? null,
  });
}

const listQuery = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  sort: z.enum(['recent', 'name', 'newest']).default('recent'),
});

adminCustomersRouter.get('/', async (req, res) => {
  const q = listQuery.parse(req.query);
  const where: Prisma.CustomerWhereInput = q.search
    ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { phone: { contains: normalizeMobile(q.search) ?? q.search } }] }
    : {};
  const orderBy: Prisma.CustomerOrderByWithRelationInput = { recent: { updatedAt: 'desc' as const }, name: { name: 'asc' as const }, newest: { createdAt: 'desc' as const } }[q.sort];
  const [customers, total] = await Promise.all([
    prisma.customer.findMany({ where, orderBy, ...paginate(q.page, q.pageSize) }),
    prisma.customer.count({ where }),
  ]);
  const stats = await customerStats(customers.map((c) => c.id));
  ok(res, paged(customers.map((c) => ({ ...c, ...stats(c.id) })), total, q.page, q.pageSize));
});

adminCustomersRouter.get('/:id', async (req, res) => {
  const { id } = idParams.parse(req.params);
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) throw ApiError.notFound('الزبون غير موجود');
  const stats = await customerStats([id]);
  const [completed, cancelled] = await Promise.all([
    prisma.order.count({ where: { customerId: id, status: 'COMPLETED' } }),
    prisma.order.count({ where: { customerId: id, status: 'CANCELLED' } }),
  ]);
  const settings = await getSettings();
  const whatsappUrl = `https://wa.me/${toWhatsAppNumber(customer.phone, settings.business.defaultCountryCode)}`;
  ok(res, { ...customer, ...stats(id), completedOrders: completed, cancelledOrders: cancelled, whatsappUrl });
});

adminCustomersRouter.get('/:id/orders', async (req, res) => {
  const { id } = idParams.parse(req.params);
  const q = paginationSchema.parse(req.query);
  const where = { customerId: id };
  const [orders, total] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, ...paginate(q.page, q.pageSize) }),
    prisma.order.count({ where }),
  ]);
  ok(
    res,
    paged(
      orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        createdAt: o.createdAt,
        status: o.status,
        statusLabel: STATUS_LABELS[o.status],
        deliveryMethod: o.deliveryMethod,
        totalQuantity: o.totalQuantity,
        total: moneyString(o.total),
        paymentStatus: o.paymentStatus,
      })),
      total,
      q.page,
      q.pageSize,
    ),
  );
});

adminCustomersRouter.patch('/:id/notes', requireRole('STAFF'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { notes } = z.object({ notes: optionalText(3000) }).parse(req.body);
  const customer = await prisma.customer.update({ where: { id }, data: { notes } });
  ok(res, customer, 'تم حفظ الملاحظات');
});
