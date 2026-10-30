import type { DeliveryMethod, Prisma } from '@prisma/client';
import { formatAmount } from '../utils/money.js';
import { toWhatsAppNumber } from '../utils/phone.js';

/** The saved order fields the message needs — always generated from the database record. */
export interface WhatsAppOrder {
  orderNumber: string;
  createdAt: Date;
  customerNameSnapshot: string;
  customerPhoneSnapshot: string;
  recipientName: string | null;
  recipientPhone: string | null;
  deliveryMethod: DeliveryMethod;
  deliveryAddress: string | null;
  deliveryArea: string | null;
  deliveryFee: Prisma.Decimal;
  pickupLocation: string | null;
  pickupTime: Date | null;
  subtotal: Prisma.Decimal;
  total: Prisma.Decimal;
  totalQuantity: number;
  customerNotes: string | null;
  items: {
    productNameSnapshot: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
    subtotal: Prisma.Decimal;
    variantSnapshot: Prisma.JsonValue;
    customizationSnapshot: Prisma.JsonValue;
  }[];
}

const TIME_ZONE = 'Asia/Hebron';

export function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat('ar-PS-u-nu-latn', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

const shekel = (v: Prisma.Decimal) => `${formatAmount(v)} شيكل`;

function variantText(snapshot: Prisma.JsonValue): string | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const s = snapshot as { name?: string; value?: string };
  return s.value ? `${s.name ?? 'الخيار'}: ${s.value}` : null;
}

function customizationLines(snapshot: Prisma.JsonValue): string[] {
  if (!Array.isArray(snapshot)) return [];
  return snapshot.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const e = entry as { label?: string; value?: string };
    return e.label && e.value ? [`${e.label}: ${e.value}`] : [];
  });
}

function itemsBlock(order: WhatsAppOrder): string[] {
  const lines: string[] = ['المنتجات:', ''];
  order.items.forEach((item, i) => {
    lines.push(`${i + 1}. ${item.productNameSnapshot}`);
    const variant = variantText(item.variantSnapshot);
    if (variant) lines.push(`   ${variant}`);
    lines.push(`   الكمية: ${item.quantity}`);
    lines.push(`   سعر القطعة: ${shekel(item.unitPrice)}`);
    lines.push(`   الإجمالي: ${shekel(item.subtotal)}`);
    const custom = customizationLines(item.customizationSnapshot);
    if (custom.length) {
      lines.push('   تفاصيل التخصيص:');
      custom.forEach((c) => lines.push(`   - ${c}`));
    }
    lines.push('');
  });
  return lines;
}

function deliveryBlock(order: WhatsAppOrder): string[] {
  const lines: string[] = [];
  if (order.deliveryMethod === 'DELIVERY') {
    lines.push('طريقة الاستلام: توصيل');
    if (order.deliveryArea) lines.push(`المنطقة: ${order.deliveryArea}`);
    if (order.deliveryAddress) lines.push(`عنوان التوصيل: ${order.deliveryAddress}`);
  } else {
    lines.push('طريقة الاستلام: استلام من الموقع');
    if (order.pickupLocation) lines.push(`موقع الاستلام: ${order.pickupLocation}`);
    lines.push(`وقت الاستلام: ${order.pickupTime ? formatDateTime(order.pickupTime) : 'فور جاهزية الطلب'}`);
  }
  if (order.recipientName || order.recipientPhone) {
    lines.push(`المستلم: ${[order.recipientName, order.recipientPhone].filter(Boolean).join(' - ')}`);
  }
  return lines;
}

function summaryBlock(order: WhatsAppOrder): string[] {
  return [
    `إجمالي الكمية: ${order.totalQuantity} قطعة`,
    '',
    `إجمالي المنتجات: ${shekel(order.subtotal)}`,
    '',
    `رسوم التوصيل: ${order.deliveryMethod === 'DELIVERY' ? shekel(order.deliveryFee) : 'لا يوجد (استلام)'}`,
    '',
    `الإجمالي النهائي: ${shekel(order.total)}`,
  ];
}

/** Message the customer sends to the business to confirm their order. */
export function buildCustomerOrderMessage(order: WhatsAppOrder, businessName = 'بصمة زيد'): string {
  return [
    `مرحباً ${businessName} 🌸`,
    '',
    'أرغب بتأكيد طلبي:',
    '',
    `رقم الطلب: ${order.orderNumber}`,
    `تاريخ الطلب: ${formatDateTime(order.createdAt)}`,
    '',
    `اسم العميل: ${order.customerNameSnapshot}`,
    `رقم الهاتف: ${order.customerPhoneSnapshot}`,
    '',
    ...itemsBlock(order),
    ...summaryBlock(order),
    '',
    ...deliveryBlock(order),
    '',
    `ملاحظات: ${order.customerNotes || 'لا يوجد'}`,
    '',
    'شكراً لكم 🌷',
  ].join('\n');
}

/** Message the business sends to the customer from the admin dashboard. */
export function buildAdminOrderMessage(order: WhatsAppOrder, businessName = 'بصمة زيد'): string {
  return [
    `مرحباً ${order.customerNameSnapshot} 🌸`,
    '',
    `معك ${businessName}، هذه تفاصيل طلبك:`,
    '',
    `رقم الطلب: ${order.orderNumber}`,
    `تاريخ الطلب: ${formatDateTime(order.createdAt)}`,
    `رقم الهاتف: ${order.customerPhoneSnapshot}`,
    '',
    ...itemsBlock(order),
    ...summaryBlock(order),
    '',
    ...deliveryBlock(order),
    '',
    `ملاحظات: ${order.customerNotes || 'لا يوجد'}`,
    '',
    `شكراً لاختياركم ${businessName} 🌷`,
  ].join('\n');
}

/** Official click-to-chat link. Returns null when no valid number is configured. */
export function buildWhatsAppUrl(phone: string | null | undefined, message: string, defaultCountryCode = '970'): string | null {
  if (!phone) return null;
  const digits = toWhatsAppNumber(phone, defaultCountryCode);
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
