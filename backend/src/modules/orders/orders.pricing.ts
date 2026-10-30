import type { DeliveryArea, Prisma } from '@prisma/client';
import type { Tx } from '../../lib/prisma.js';
import { ApiError, type FieldError } from '../../utils/http.js';
import { Decimal, toDecimal, unitPriceFor, ZERO } from '../../utils/money.js';
import { keyOf, type StockKey } from '../inventory/inventory.service.js';
import type { Settings } from '../settings/settings.service.js';
import type { QuoteInput } from './orders.schemas.js';

export interface CustomizationValue {
  label: string;
  value: string;
}

export interface PreparedLine {
  productId: string;
  variantId: string | null;
  productName: string;
  productSku: string | null;
  productImage: string | null;
  variant: { name: string; value: string; sku: string | null } | null;
  customization: CustomizationValue[];
  quantity: number;
  unitPrice: Decimal;
  subtotal: Decimal;
  /** Stock currently available for this line's stock row (informational, pre-transaction) */
  available: number;
}

export interface PreparedOrder {
  lines: PreparedLine[];
  /** Total requested quantity per stock row (lines with the same product/variant are combined) */
  stockRequirements: Map<string, StockKey & { quantity: number; productName: string }>;
  totalQuantity: number;
  subtotal: Decimal;
  deliveryFee: Decimal;
  total: Decimal;
  deliveryArea: DeliveryArea | null;
  pickupLocation: string | null;
  pickupTime: Date | null;
}

const productSelect = {
  id: true,
  name: true,
  sku: true,
  price: true,
  discountPrice: true,
  stockQuantity: true,
  isActive: true,
  deletedAt: true,
  allowCustomization: true,
  category: { select: { isActive: true } },
  images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { imageUrl: true } },
  variants: true,
  customFields: true,
} satisfies Prisma.ProductSelect;

/**
 * Validates an order against the database and computes every amount from current DB prices.
 * Prices, fees and totals sent by the client are never used.
 * With `checkStock`, insufficient stock is reported here too (the authoritative check is the
 * guarded decrement inside the order transaction).
 */
export async function prepareOrder(db: Tx, input: QuoteInput, settings: Settings, { checkStock = true } = {}): Promise<PreparedOrder> {
  const errors: FieldError[] = [];
  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const products = new Map((await db.product.findMany({ where: { id: { in: productIds } }, select: productSelect })).map((p) => [p.id, p]));

  const lines: PreparedLine[] = [];
  const stockRequirements: PreparedOrder['stockRequirements'] = new Map();

  input.items.forEach((item, index) => {
    const path = `items.${index}`;
    const product = products.get(item.productId);
    if (!product || product.deletedAt) {
      errors.push({ path, message: 'أحد المنتجات في السلة لم يعد متوفراً، يرجى إزالته' });
      return;
    }
    if (!product.isActive || !product.category.isActive) {
      errors.push({ path, message: `المنتج "${product.name}" غير متاح للطلب حالياً` });
      return;
    }

    const activeVariants = product.variants.filter((v) => v.isActive);
    let variant: (typeof product.variants)[number] | null = null;
    if (activeVariants.length > 0) {
      variant = activeVariants.find((v) => v.id === item.variantId) ?? null;
      if (!variant) {
        errors.push({ path, message: `يرجى اختيار خيار متوفر للمنتج "${product.name}"` });
        return;
      }
    } else if (item.variantId) {
      errors.push({ path, message: `الخيار المحدد للمنتج "${product.name}" لم يعد متوفراً` });
      return;
    }

    // Customization: only configured fields are accepted; required fields must be filled.
    const customization: CustomizationValue[] = [];
    if (product.allowCustomization) {
      const given = new Map(item.customization.map((c) => [c.fieldId, c.value]));
      for (const field of [...product.customFields].sort((a, b) => a.sortOrder - b.sortOrder)) {
        const value = (given.get(field.id) ?? '').trim();
        if (!value) {
          if (field.isRequired) errors.push({ path, message: `يرجى تعبئة "${field.label}" للمنتج "${product.name}"` });
          continue;
        }
        if (value.length > field.maxLength) {
          errors.push({ path, message: `"${field.label}" يجب ألا يتجاوز ${field.maxLength} حرفاً` });
          continue;
        }
        if (field.fieldType === 'SELECT' && !field.options.includes(value)) {
          errors.push({ path, message: `القيمة المختارة لـ "${field.label}" غير صحيحة` });
          continue;
        }
        customization.push({ label: field.label, value });
      }
      if (item.customNote) customization.push({ label: 'ملاحظات التخصيص', value: item.customNote });
    }

    const available = variant ? variant.stockQuantity : product.stockQuantity;
    const unitPrice = unitPriceFor(product.price, product.discountPrice, variant?.priceAdjustment ?? null);
    const key: StockKey = { productId: product.id, variantId: variant?.id ?? null };
    const requirement = stockRequirements.get(keyOf(key)) ?? { ...key, quantity: 0, productName: variant ? `${product.name} (${variant.value})` : product.name };
    requirement.quantity += item.quantity;
    stockRequirements.set(keyOf(key), requirement);

    lines.push({
      productId: product.id,
      variantId: variant?.id ?? null,
      productName: product.name,
      productSku: variant?.sku ?? product.sku,
      productImage: product.images[0]?.imageUrl ?? null,
      variant: variant ? { name: variant.name, value: variant.value, sku: variant.sku } : null,
      customization,
      quantity: item.quantity,
      unitPrice,
      subtotal: unitPrice.times(item.quantity).toDecimalPlaces(2),
      available,
    });
  });

  if (checkStock) {
    for (const req of stockRequirements.values()) {
      const line = lines.find((l) => l.productId === req.productId && l.variantId === req.variantId)!;
      if (line.available <= 0) errors.push({ path: 'items', message: `المنتج "${req.productName}" نفد من المخزون` });
      else if (req.quantity > line.available) errors.push({ path: 'items', message: `الكمية المطلوبة من "${req.productName}" غير متوفرة. المتوفر حالياً: ${line.available}` });
    }
  }

  const subtotal = lines.reduce((sum, l) => sum.plus(l.subtotal), ZERO);
  const totalQuantity = lines.reduce((sum, l) => sum + l.quantity, 0);

  // Delivery / pickup
  let deliveryFee = ZERO;
  let deliveryArea: DeliveryArea | null = null;
  let pickupLocation: string | null = null;
  let pickupTime: Date | null = null;

  if (input.deliveryMethod === 'DELIVERY') {
    if (!settings.delivery.deliveryEnabled) errors.push({ path: 'deliveryMethod', message: 'خدمة التوصيل غير متاحة حالياً، يرجى اختيار الاستلام' });
    deliveryArea = input.deliveryAreaId ? await db.deliveryArea.findFirst({ where: { id: input.deliveryAreaId, isActive: true } }) : null;
    if (!deliveryArea) errors.push({ path: 'deliveryAreaId', message: 'منطقة التوصيل المختارة غير متاحة' });
    else deliveryFee = toDecimal(deliveryArea.deliveryFee);

    const min = settings.delivery.minOrderAmount;
    if (min && subtotal.lt(toDecimal(min))) {
      errors.push({ path: 'deliveryMethod', message: `الحد الأدنى لطلبات التوصيل هو ${min} شيكل` });
    }
  } else {
    if (!settings.delivery.pickupEnabled) errors.push({ path: 'deliveryMethod', message: 'الاستلام من الموقع غير متاح حالياً، يرجى اختيار التوصيل' });
    pickupLocation = settings.delivery.pickupLocation || null;
    if (input.pickupTime) {
      pickupTime = new Date(input.pickupTime);
      const now = Date.now();
      if (pickupTime.getTime() < now - 5 * 60 * 1000) errors.push({ path: 'pickupTime', message: 'وقت الاستلام يجب أن يكون في المستقبل' });
      else if (pickupTime.getTime() > now + 90 * 24 * 60 * 60 * 1000) errors.push({ path: 'pickupTime', message: 'وقت الاستلام بعيد جداً' });
    }
  }

  if (errors.length) throw ApiError.badRequest(errors[0].message, errors, errors.some((e) => e.message.includes('غير متوفرة') || e.message.includes('نفد')) ? 'OUT_OF_STOCK' : 'ORDER_INVALID');

  return {
    lines,
    stockRequirements,
    totalQuantity,
    subtotal: subtotal.toDecimalPlaces(2),
    deliveryFee: deliveryFee.toDecimalPlaces(2),
    total: subtotal.plus(deliveryFee).toDecimalPlaces(2),
    deliveryArea,
    pickupLocation,
    pickupTime,
  };
}
