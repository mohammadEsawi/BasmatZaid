import { randomBytes } from 'node:crypto';
import { MovementType, OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/http.js';
import { moneyString } from '../../utils/money.js';
import { buildAdminOrderMessage, buildCustomerOrderMessage, buildWhatsAppUrl } from '../../services/whatsapp.js';
import { keyOf, restoreOrderStock, tryDecrement } from '../inventory/inventory.service.js';
import { getSettings, type Settings } from '../settings/settings.service.js';
import { prepareOrder } from './orders.pricing.js';
import type { CreateOrderInput, QuoteInput } from './orders.schemas.js';

export const STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'جديد',
  CONFIRMED: 'مؤكد',
  PREPARING: 'قيد التجهيز',
  READY: 'جاهز',
  OUT_FOR_DELIVERY: 'قيد التوصيل',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي',
};

/**
 * Allowed status transitions. Final states (COMPLETED, CANCELLED) cannot change.
 * OUT_FOR_DELIVERY is only for delivery orders; pickup orders go READY -> COMPLETED (collected).
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'READY', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function allowedTransitions(status: OrderStatus, deliveryMethod: 'PICKUP' | 'DELIVERY'): OrderStatus[] {
  return TRANSITIONS[status].filter((next) => {
    if (next === 'OUT_FOR_DELIVERY') return deliveryMethod === 'DELIVERY';
    if (status === 'READY' && next === 'COMPLETED') return deliveryMethod === 'PICKUP';
    return true;
  });
}

export const orderInclude = {
  items: { include: { product: { select: { slug: true, images: { orderBy: { sortOrder: 'asc' }, take: 1 } } } } },
} satisfies Prisma.OrderInclude;
type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

/** Order number like BZ-2026-0001; the per-year counter row is incremented atomically. */
async function nextOrderNumber(tx: Prisma.TransactionClient, now = new Date()) {
  const year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Hebron', year: 'numeric' }).format(now));
  const rows = await tx.$queryRaw<{ lastValue: number }[]>`
    INSERT INTO "OrderSequence" ("year", "lastValue") VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "lastValue" = "OrderSequence"."lastValue" + 1
    RETURNING "lastValue"`;
  return `BZ-${year}-${String(rows[0].lastValue).padStart(4, '0')}`;
}

function assertStoreAccepting(settings: Settings) {
  if (!settings.store.storeOpen || !settings.store.acceptingOrders) {
    throw new ApiError(503, settings.store.closedMessage || 'المتجر لا يستقبل طلبات حالياً', [], 'STORE_CLOSED');
  }
}

/** Server-calculated preview of totals shown on the checkout page before confirming. */
export async function quoteOrder(input: QuoteInput) {
  const settings = await getSettings();
  assertStoreAccepting(settings);
  const prepared = await prepareOrder(prisma, input, settings);
  return {
    items: prepared.lines.map((l) => ({
      productId: l.productId,
      variantId: l.variantId,
      productName: l.productName,
      variant: l.variant,
      customization: l.customization,
      quantity: l.quantity,
      unitPrice: moneyString(l.unitPrice),
      subtotal: moneyString(l.subtotal),
    })),
    totalQuantity: prepared.totalQuantity,
    subtotal: moneyString(prepared.subtotal),
    deliveryFee: moneyString(prepared.deliveryFee),
    total: moneyString(prepared.total),
    deliveryArea: prepared.deliveryArea ? { id: prepared.deliveryArea.id, name: prepared.deliveryArea.name } : null,
    pickupLocation: prepared.pickupLocation,
  };
}

/**
 * Creates an order in a single transaction:
 * validate + price from DB -> guarded stock decrement -> customer upsert -> order number ->
 * order + items + status history -> inventory movements.
 * Any failure rolls everything back, so stock and orders never disagree.
 */
export async function createOrder(input: CreateOrderInput): Promise<{ order: OrderWithItems; duplicate: boolean }> {
  if (input.idempotencyKey) {
    const existing = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: orderInclude });
    if (existing) return { order: existing, duplicate: true };
  }

  const settings = await getSettings();
  assertStoreAccepting(settings);

  try {
    const order = await prisma.$transaction(
      async (tx) => {
        const prepared = await prepareOrder(tx, input, settings);

        // Lock stock rows in a stable order to avoid deadlocks between concurrent orders.
        const requirements = [...prepared.stockRequirements.values()].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
        const movements: Prisma.InventoryMovementCreateManyInput[] = [];
        for (const req of requirements) {
          const newQuantity = await tryDecrement(tx, req, req.quantity);
          if (newQuantity === null) {
            const current = req.variantId
              ? (await tx.productVariant.findUnique({ where: { id: req.variantId }, select: { stockQuantity: true } }))?.stockQuantity ?? 0
              : (await tx.product.findUnique({ where: { id: req.productId }, select: { stockQuantity: true } }))?.stockQuantity ?? 0;
            throw ApiError.conflict(
              current > 0 ? `الكمية المطلوبة من "${req.productName}" غير متوفرة. المتوفر حالياً: ${current}` : `المنتج "${req.productName}" نفد من المخزون`,
              'OUT_OF_STOCK',
            );
          }
          movements.push({
            productId: req.productId,
            variantId: req.variantId,
            movementType: MovementType.ORDER_DEDUCTION,
            quantityChange: -req.quantity,
            previousQuantity: newQuantity + req.quantity,
            newQuantity,
            reason: 'خصم تلقائي عند استلام الطلب',
          });
        }

        const customer = await tx.customer.upsert({
          where: { phone: input.customer.phone },
          create: { name: input.customer.name, phone: input.customer.phone },
          update: { name: input.customer.name },
        });

        const orderNumber = await nextOrderNumber(tx);
        const created = await tx.order.create({
          data: {
            orderNumber,
            trackingToken: randomBytes(24).toString('base64url'),
            idempotencyKey: input.idempotencyKey ?? null,
            customerId: customer.id,
            customerNameSnapshot: input.customer.name,
            customerPhoneSnapshot: input.customer.phone,
            recipientName: input.recipient?.name ?? null,
            recipientPhone: input.recipient?.phone ?? null,
            deliveryMethod: input.deliveryMethod,
            deliveryAddress: input.deliveryMethod === 'DELIVERY' ? input.deliveryAddress : null,
            deliveryAreaId: prepared.deliveryArea?.id ?? null,
            deliveryArea: prepared.deliveryArea?.name ?? null,
            deliveryFee: prepared.deliveryFee,
            pickupLocation: prepared.pickupLocation,
            pickupTime: prepared.pickupTime,
            subtotal: prepared.subtotal,
            total: prepared.total,
            totalQuantity: prepared.totalQuantity,
            status: 'NEW',
            inventoryStatus: 'DEDUCTED',
            paymentMethod: input.paymentMethod,
            customerNotes: input.notes,
            items: {
              create: prepared.lines.map((l) => ({
                productId: l.productId,
                variantId: l.variantId,
                productNameSnapshot: l.productName,
                productSkuSnapshot: l.productSku,
                productImageSnapshot: l.productImage,
                variantSnapshot: l.variant ?? Prisma.DbNull,
                customizationSnapshot: l.customization.length ? (l.customization as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                subtotal: l.subtotal,
              })),
            },
            statusHistory: { create: { previousStatus: null, newStatus: 'NEW', note: 'تم إنشاء الطلب من الموقع' } },
          },
          include: orderInclude,
        });

        await tx.inventoryMovement.createMany({ data: movements.map((m) => ({ ...m, orderId: created.id })) });
        return created;
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
    return { order, duplicate: false };
  } catch (error) {
    // Two concurrent submissions with the same key: the loser returns the winner's order.
    if (input.idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: orderInclude });
      if (existing) return { order: existing, duplicate: true };
    }
    throw error;
  }
}

export interface StatusChangeInput {
  orderId: string;
  status: OrderStatus;
  note: string | null;
  adminUserId: string;
}

export async function changeOrderStatus({ orderId, status, note, adminUserId }: StatusChangeInput) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, status: true, deliveryMethod: true } });
    if (!order) throw ApiError.notFound('الطلب غير موجود');
    if (order.status === status) throw ApiError.badRequest(`الطلب بالفعل بحالة "${STATUS_LABELS[status]}"`);

    if (!allowedTransitions(order.status, order.deliveryMethod).includes(status)) {
      throw ApiError.badRequest(`لا يمكن تغيير حالة الطلب من "${STATUS_LABELS[order.status]}" إلى "${STATUS_LABELS[status]}"`, [], 'INVALID_TRANSITION');
    }
    if (status === 'CANCELLED' && order.status === 'OUT_FOR_DELIVERY' && !note) {
      throw ApiError.badRequest('يرجى كتابة سبب إلغاء طلب قيد التوصيل');
    }

    // Guard on the previous status so two admins can't apply conflicting changes.
    const { count } = await tx.order.updateMany({ where: { id: orderId, status: order.status }, data: { status } });
    if (count === 0) throw ApiError.conflict('تم تعديل حالة الطلب من مستخدم آخر، يرجى تحديث الصفحة', 'CONCURRENT_UPDATE');

    let stockRestored = false;
    if (status === 'CANCELLED') stockRestored = await restoreOrderStock(tx, orderId, adminUserId);

    await tx.orderStatusHistory.create({
      data: { orderId, adminUserId, previousStatus: order.status, newStatus: status, note },
    });
    return { stockRestored };
  });
}

// ---------------- Serialization ----------------

function serializeItems(order: OrderWithItems) {
  return order.items.map((i) => ({
    id: i.id,
    productId: i.productId,
    productSlug: i.product?.slug ?? null,
    variantId: i.variantId,
    productName: i.productNameSnapshot,
    productSku: i.productSkuSnapshot,
    image: i.productImageSnapshot ?? i.product?.images[0]?.imageUrl ?? null,
    variant: i.variantSnapshot,
    customization: i.customizationSnapshot ?? [],
    quantity: i.quantity,
    unitPrice: moneyString(i.unitPrice),
    subtotal: moneyString(i.subtotal),
  }));
}

/** What the customer may see with their tracking token: no internal notes or admin data. */
export function toCustomerOrder(order: OrderWithItems, settings: Settings) {
  const message = buildCustomerOrderMessage(order, settings.business.nameAr);
  return {
    orderNumber: order.orderNumber,
    trackingToken: order.trackingToken,
    createdAt: order.createdAt,
    status: order.status,
    statusLabel: STATUS_LABELS[order.status],
    customerName: order.customerNameSnapshot,
    customerPhone: order.customerPhoneSnapshot,
    recipientName: order.recipientName,
    recipientPhone: order.recipientPhone,
    deliveryMethod: order.deliveryMethod,
    deliveryArea: order.deliveryArea,
    deliveryAddress: order.deliveryAddress,
    pickupLocation: order.pickupLocation,
    pickupTime: order.pickupTime,
    items: serializeItems(order),
    totalQuantity: order.totalQuantity,
    subtotal: moneyString(order.subtotal),
    deliveryFee: moneyString(order.deliveryFee),
    total: moneyString(order.total),
    paymentMethod: order.paymentMethod,
    customerNotes: order.customerNotes,
    whatsappUrl: buildWhatsAppUrl(settings.business.whatsappNumber, message, settings.business.defaultCountryCode),
    whatsappMessage: message,
  };
}

export async function getAdminOrder(id: string) {
  const [order, settings] = await Promise.all([
    prisma.order.findUnique({
      where: { id },
      include: {
        ...orderInclude,
        customer: { select: { id: true, name: true, phone: true, notes: true, _count: { select: { orders: true } } } },
        statusHistory: { orderBy: { createdAt: 'asc' }, include: { adminUser: { select: { id: true, name: true } } } },
        inventoryMovements: {
          orderBy: { createdAt: 'asc' },
          include: { product: { select: { name: true } }, variant: { select: { name: true, value: true } }, adminUser: { select: { name: true } } },
        },
      },
    }),
    getSettings(),
  ]);
  if (!order) throw ApiError.notFound('الطلب غير موجود');

  const adminMessage = buildAdminOrderMessage(order, settings.business.nameAr);
  const customerMessage = buildCustomerOrderMessage(order, settings.business.nameAr);
  const cc = settings.business.defaultCountryCode;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    status: order.status,
    statusLabel: STATUS_LABELS[order.status],
    allowedTransitions: allowedTransitions(order.status, order.deliveryMethod),
    inventoryStatus: order.inventoryStatus,
    customer: order.customer,
    customerName: order.customerNameSnapshot,
    customerPhone: order.customerPhoneSnapshot,
    recipientName: order.recipientName,
    recipientPhone: order.recipientPhone,
    deliveryMethod: order.deliveryMethod,
    deliveryArea: order.deliveryArea,
    deliveryAddress: order.deliveryAddress,
    pickupLocation: order.pickupLocation,
    pickupTime: order.pickupTime,
    items: serializeItems(order),
    totalQuantity: order.totalQuantity,
    subtotal: moneyString(order.subtotal),
    deliveryFee: moneyString(order.deliveryFee),
    total: moneyString(order.total),
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    customerNotes: order.customerNotes,
    adminNotes: order.adminNotes,
    statusHistory: order.statusHistory.map((h) => ({
      id: h.id,
      previousStatus: h.previousStatus,
      newStatus: h.newStatus,
      previousLabel: h.previousStatus ? STATUS_LABELS[h.previousStatus] : null,
      newLabel: STATUS_LABELS[h.newStatus],
      note: h.note,
      admin: h.adminUser,
      createdAt: h.createdAt,
    })),
    inventoryMovements: order.inventoryMovements,
    whatsapp: {
      /** Business -> customer, using the phone stored in the order */
      toCustomerUrl: buildWhatsAppUrl(order.customerPhoneSnapshot, adminMessage, cc),
      /** Forward the full order to the business number (e.g. to another device/staff) */
      toBusinessUrl: buildWhatsAppUrl(settings.business.whatsappNumber, customerMessage, cc),
      message: adminMessage,
    },
  };
}
