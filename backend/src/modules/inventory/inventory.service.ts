import { MovementType, OrderStatus, Prisma } from '@prisma/client';
import { prisma, type Tx } from '../../lib/prisma.js';
import { ApiError } from '../../utils/http.js';

export interface StockKey {
  productId: string;
  variantId: string | null;
}

export const keyOf = (k: StockKey) => `${k.productId}:${k.variantId ?? ''}`;

/**
 * Atomically removes `quantity` units. The `stockQuantity >= quantity` guard in the same
 * UPDATE statement makes overselling impossible even under concurrent orders: the row
 * lock serializes competing updates and the losing one matches zero rows.
 * Returns the new quantity, or null when there is not enough stock.
 */
export async function tryDecrement(tx: Tx, key: StockKey, quantity: number): Promise<number | null> {
  if (key.variantId) {
    const { count } = await tx.productVariant.updateMany({
      where: { id: key.variantId, productId: key.productId, stockQuantity: { gte: quantity } },
      data: { stockQuantity: { decrement: quantity } },
    });
    if (count === 0) return null;
    const v = await tx.productVariant.findUniqueOrThrow({ where: { id: key.variantId }, select: { stockQuantity: true } });
    return v.stockQuantity;
  }
  const { count } = await tx.product.updateMany({
    where: { id: key.productId, stockQuantity: { gte: quantity } },
    data: { stockQuantity: { decrement: quantity } },
  });
  if (count === 0) return null;
  const p = await tx.product.findUniqueOrThrow({ where: { id: key.productId }, select: { stockQuantity: true } });
  return p.stockQuantity;
}

async function increment(tx: Tx, key: StockKey, quantity: number): Promise<number | null> {
  if (key.variantId) {
    const { count } = await tx.productVariant.updateMany({ where: { id: key.variantId }, data: { stockQuantity: { increment: quantity } } });
    if (count === 0) return null;
    return (await tx.productVariant.findUniqueOrThrow({ where: { id: key.variantId }, select: { stockQuantity: true } })).stockQuantity;
  }
  const { count } = await tx.product.updateMany({ where: { id: key.productId }, data: { stockQuantity: { increment: quantity } } });
  if (count === 0) return null;
  return (await tx.product.findUniqueOrThrow({ where: { id: key.productId }, select: { stockQuantity: true } })).stockQuantity;
}

/** Locks the stock row (SELECT ... FOR UPDATE) and returns its current quantity. */
async function lockAndRead(tx: Tx, key: StockKey): Promise<number | null> {
  const rows = key.variantId
    ? await tx.$queryRaw<{ stockQuantity: number }[]>`SELECT "stockQuantity" FROM "ProductVariant" WHERE "id" = ${key.variantId} AND "productId" = ${key.productId} FOR UPDATE`
    : await tx.$queryRaw<{ stockQuantity: number }[]>`SELECT "stockQuantity" FROM "Product" WHERE "id" = ${key.productId} FOR UPDATE`;
  return rows[0]?.stockQuantity ?? null;
}

export interface AdjustStockInput {
  productId: string;
  variantId?: string | null;
  /** 'set' replaces the quantity; 'adjust' adds a positive or negative delta. */
  mode: 'set' | 'adjust';
  quantity: number;
  reason: string;
  adminUserId: string;
}

/** Manual stock change by an admin, always recorded in the movement history. */
export async function adjustStock(input: AdjustStockInput) {
  const key: StockKey = { productId: input.productId, variantId: input.variantId ?? null };

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({ where: { id: key.productId, deletedAt: null }, select: { id: true } });
    if (!product) throw ApiError.notFound('المنتج غير موجود');

    const previous = await lockAndRead(tx, key);
    if (previous === null) throw ApiError.notFound(key.variantId ? 'الخيار غير موجود لهذا المنتج' : 'المنتج غير موجود');

    const next = input.mode === 'set' ? input.quantity : previous + input.quantity;
    if (next < 0) throw ApiError.badRequest(`لا يمكن أن يصبح المخزون سالباً (المتوفر حالياً ${previous})`, [], 'NEGATIVE_STOCK');
    if (next === previous) throw ApiError.badRequest('الكمية الجديدة مطابقة للكمية الحالية');

    if (key.variantId) await tx.productVariant.update({ where: { id: key.variantId }, data: { stockQuantity: next } });
    else await tx.product.update({ where: { id: key.productId }, data: { stockQuantity: next } });

    return tx.inventoryMovement.create({
      data: {
        productId: key.productId,
        variantId: key.variantId,
        adminUserId: input.adminUserId,
        movementType: MovementType.MANUAL_ADJUSTMENT,
        quantityChange: next - previous,
        previousQuantity: previous,
        newQuantity: next,
        reason: input.reason,
      },
    });
  });
}

/**
 * Restores an order's stock exactly once. The status flip DEDUCTED -> RESTORED is a guarded
 * update, so a second (or concurrent) cancellation restores nothing. Orders that never
 * deducted stock (inventoryStatus NONE) are skipped.
 */
export async function restoreOrderStock(tx: Tx, orderId: string, adminUserId: string | null): Promise<boolean> {
  const { count } = await tx.order.updateMany({
    where: { id: orderId, inventoryStatus: 'DEDUCTED' },
    data: { inventoryStatus: 'RESTORED' },
  });
  if (count === 0) return false;

  const items = await tx.orderItem.findMany({ where: { orderId }, select: { productId: true, variantId: true, quantity: true } });
  // Aggregate lines that share a stock row and lock rows in a stable order to avoid deadlocks.
  const totals = new Map<string, StockKey & { quantity: number }>();
  for (const item of items) {
    if (!item.productId) continue; // product was hard-deleted; nothing to restore into
    const key = { productId: item.productId, variantId: item.variantId };
    const entry = totals.get(keyOf(key)) ?? { ...key, quantity: 0 };
    entry.quantity += item.quantity;
    totals.set(keyOf(key), entry);
  }

  for (const entry of [...totals.values()].sort((a, b) => keyOf(a).localeCompare(keyOf(b)))) {
    const newQuantity = await increment(tx, entry, entry.quantity);
    if (newQuantity === null) continue; // variant removed since the order; snapshot remains in the order
    await tx.inventoryMovement.create({
      data: {
        productId: entry.productId,
        variantId: entry.variantId,
        orderId,
        adminUserId,
        movementType: MovementType.ORDER_CANCELLATION_RESTORE,
        quantityChange: entry.quantity,
        previousQuantity: newQuantity - entry.quantity,
        newQuantity,
        reason: 'إرجاع المخزون بسبب إلغاء الطلب',
      },
    });
  }
  return true;
}

/** Open orders hold deducted stock that is not yet sold ("reserved"). */
export const OPEN_STATUSES: OrderStatus[] = ['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'];

/** Reserved (open orders) and sold (completed orders) quantities per stock row. */
export async function getReservedAndSold(productIds: string[]) {
  const where = (statuses: OrderStatus[]): Prisma.OrderItemWhereInput => ({
    productId: { in: productIds },
    order: { status: { in: statuses }, inventoryStatus: 'DEDUCTED' },
  });
  const [reserved, sold] = await Promise.all([
    prisma.orderItem.groupBy({ by: ['productId', 'variantId'], where: where(OPEN_STATUSES), _sum: { quantity: true } }),
    prisma.orderItem.groupBy({ by: ['productId', 'variantId'], where: where(['COMPLETED']), _sum: { quantity: true } }),
  ]);
  const toMap = (rows: typeof reserved) =>
    new Map(rows.map((r) => [keyOf({ productId: r.productId!, variantId: r.variantId }), r._sum.quantity ?? 0]));
  return { reserved: toMap(reserved), sold: toMap(sold) };
}
