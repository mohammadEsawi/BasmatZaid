import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { ok } from '../../utils/http.js';
import { moneyString, ZERO } from '../../utils/money.js';
import { productInclude, stockInfo } from '../products/products.service.js';
import { OPEN_STATUSES } from '../inventory/inventory.service.js';
import { STATUS_LABELS } from '../orders/orders.service.js';

export const adminDashboardRouter = Router();

adminDashboardRouter.get('/stats', async (_req, res) => {
  const [products, statusCounts, sales, completedSales, bestSellers, daily] = await Promise.all([
    prisma.product.findMany({ where: { deletedAt: null }, select: { isActive: true, stockQuantity: true, lowStockThreshold: true, variants: productInclude.variants } }),
    prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.order.aggregate({ where: { status: { not: 'CANCELLED' } }, _sum: { total: true } }),
    prisma.order.aggregate({ where: { status: 'COMPLETED' }, _sum: { total: true } }),
    prisma.orderItem.groupBy({
      by: ['productId', 'productNameSnapshot'],
      where: { order: { status: { not: 'CANCELLED' } } },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5,
    }),
    // Sales per local day for the last 14 days (excluding cancelled orders).
    prisma.$queryRaw<{ day: string; total: Prisma.Decimal; orders: bigint }[]>`
      SELECT to_char(date_trunc('day', "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hebron'), 'YYYY-MM-DD') AS day,
             COALESCE(SUM("total"), 0) AS total,
             COUNT(*) AS orders
      FROM "Order"
      WHERE "status" <> 'CANCELLED' AND "createdAt" >= NOW() - INTERVAL '14 days'
      GROUP BY 1 ORDER BY 1`,
  ]);

  const stock = products.map((p) => ({ isActive: p.isActive, ...stockInfo(p) }));
  const counts = Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all])) as Partial<Record<string, number>>;
  const count = (s: string) => counts[s] ?? 0;

  // Fill missing days so the chart has a continuous 14-day axis.
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const days: { day: string; total: string | null; orders: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hebron' }).format(d);
    const row = byDay.get(key);
    days.push({ day: key, total: moneyString(row?.total ?? ZERO), orders: Number(row?.orders ?? 0) });
  }

  ok(res, {
    products: {
      total: stock.length,
      active: stock.filter((p) => p.isActive).length,
      outOfStock: stock.filter((p) => p.availability === 'OUT_OF_STOCK').length,
      lowStock: stock.filter((p) => p.availability === 'LOW_STOCK').length,
    },
    orders: {
      total: statusCounts.reduce((s, c) => s + c._count._all, 0),
      new: count('NEW'),
      pending: OPEN_STATUSES.reduce((s, st) => s + count(st), 0),
      confirmed: count('CONFIRMED'),
      preparing: count('PREPARING'),
      ready: count('READY'),
      outForDelivery: count('OUT_FOR_DELIVERY'),
      completed: count('COMPLETED'),
      cancelled: count('CANCELLED'),
    },
    sales: {
      total: moneyString(sales._sum.total ?? ZERO),
      completed: moneyString(completedSales._sum.total ?? ZERO),
      daily: days,
    },
    bestSellers: bestSellers.map((b) => ({
      productId: b.productId,
      name: b.productNameSnapshot,
      quantity: b._sum.quantity ?? 0,
      revenue: moneyString(b._sum.subtotal ?? ZERO),
    })),
  });
});

adminDashboardRouter.get('/recent-orders', async (_req, res) => {
  const orders = await prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 8 });
  ok(
    res,
    orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      createdAt: o.createdAt,
      customerName: o.customerNameSnapshot,
      deliveryMethod: o.deliveryMethod,
      total: moneyString(o.total),
      status: o.status,
      statusLabel: STATUS_LABELS[o.status],
    })),
  );
});
