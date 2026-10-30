import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { ok } from '../../utils/http.js';
import { paginate, paged, paginationSchema } from '../../utils/pagination.js';
import { idSchema } from '../../validators/common.js';
import { productInclude, stockInfo } from '../products/products.service.js';
import { getReservedAndSold, keyOf } from './inventory.service.js';

export const adminInventoryRouter = Router();

const overviewQuery = z.object({
  search: z.string().trim().max(100).optional(),
  filter: z.enum(['all', 'low', 'out']).default('all'),
});

/**
 * Per product (and per variant):
 *  available = units that can still be ordered (the stock column)
 *  reserved  = units in open orders (deducted, not yet completed)
 *  sold      = units in completed orders
 *  onHand    = available + reserved (physically still in the workshop)
 */
adminInventoryRouter.get('/', async (req, res) => {
  const q = overviewQuery.parse(req.query);
  const products = await prisma.product.findMany({
    where: {
      deletedAt: null,
      ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { sku: { contains: q.search, mode: 'insensitive' } }] } : {}),
    },
    include: productInclude,
    orderBy: { name: 'asc' },
  });
  const { reserved, sold } = await getReservedAndSold(products.map((p) => p.id));

  const rows = products.map((p) => {
    const stock = stockInfo(p);
    const variantRows = p.variants.map((v) => {
      const k = keyOf({ productId: p.id, variantId: v.id });
      const r = reserved.get(k) ?? 0;
      return { id: v.id, label: `${v.name}: ${v.value}`, sku: v.sku, isActive: v.isActive, available: v.stockQuantity, reserved: r, sold: sold.get(k) ?? 0, onHand: v.stockQuantity + r };
    });
    const ownKey = keyOf({ productId: p.id, variantId: null });
    const reservedTotal = stock.hasVariants ? variantRows.reduce((s, v) => s + v.reserved, 0) : reserved.get(ownKey) ?? 0;
    const soldTotal = stock.hasVariants ? variantRows.reduce((s, v) => s + v.sold, 0) : sold.get(ownKey) ?? 0;
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      image: p.images[0]?.imageUrl ?? null,
      category: p.category.name,
      isActive: p.isActive,
      lowStockThreshold: p.lowStockThreshold,
      hasVariants: stock.hasVariants,
      availability: stock.availability,
      available: stock.available,
      reserved: reservedTotal,
      sold: soldTotal,
      onHand: stock.available + reservedTotal,
      variants: variantRows,
    };
  });

  const filtered = q.filter === 'all' ? rows : rows.filter((r) => (q.filter === 'low' ? r.availability === 'LOW_STOCK' : r.availability === 'OUT_OF_STOCK'));
  ok(res, {
    items: filtered,
    summary: {
      totalProducts: rows.length,
      lowStock: rows.filter((r) => r.availability === 'LOW_STOCK').length,
      outOfStock: rows.filter((r) => r.availability === 'OUT_OF_STOCK').length,
      totalAvailableUnits: rows.reduce((s, r) => s + r.available, 0),
      totalReservedUnits: rows.reduce((s, r) => s + r.reserved, 0),
    },
  });
});

const movementsQuery = paginationSchema.extend({
  productId: idSchema.optional(),
  orderId: idSchema.optional(),
  type: z.enum(['INITIAL_STOCK', 'ORDER_DEDUCTION', 'ORDER_CANCELLATION_RESTORE', 'MANUAL_ADJUSTMENT']).optional(),
});

adminInventoryRouter.get('/movements', async (req, res) => {
  const q = movementsQuery.parse(req.query);
  const where: Prisma.InventoryMovementWhereInput = {
    ...(q.productId ? { productId: q.productId } : {}),
    ...(q.orderId ? { orderId: q.orderId } : {}),
    ...(q.type ? { movementType: q.type } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        product: { select: { id: true, name: true } },
        variant: { select: { name: true, value: true } },
        order: { select: { id: true, orderNumber: true } },
        adminUser: { select: { id: true, name: true } },
      },
      ...paginate(q.page, q.pageSize),
    }),
    prisma.inventoryMovement.count({ where }),
  ]);
  ok(res, paged(items, total, q.page, q.pageSize));
});
