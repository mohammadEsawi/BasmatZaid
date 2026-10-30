import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { formatAmount, unitPriceFor } from '../src/utils/money.js';
import { normalizeMobile, toWhatsAppNumber } from '../src/utils/phone.js';
import { slugify } from '../src/utils/slug.js';
import { buildCustomerOrderMessage, buildWhatsAppUrl, type WhatsAppOrder } from '../src/services/whatsapp.js';
import { allowedTransitions } from '../src/modules/orders/orders.service.js';

const D = (v: string) => new Prisma.Decimal(v);

describe('money', () => {
  it('uses the discount price plus variant adjustment', () => {
    expect(unitPriceFor(D('15'), null).toFixed(2)).toBe('15.00');
    expect(unitPriceFor(D('25'), D('20')).toFixed(2)).toBe('20.00');
    expect(unitPriceFor(D('6'), null, D('0.5')).toFixed(2)).toBe('6.50');
    expect(unitPriceFor(D('5'), null, D('-10')).toFixed(2)).toBe('0.00');
  });

  it('avoids floating point drift', () => {
    // 0.1 + 0.2 !== 0.3 in floats; Decimal keeps it exact.
    expect(D('0.1').plus(D('0.2')).toFixed(2)).toBe('0.30');
    expect(unitPriceFor(D('1.10'), null).times(3).toFixed(2)).toBe('3.30');
  });

  it('formats whole and fractional amounts', () => {
    expect(formatAmount(D('15.00'))).toBe('15');
    expect(formatAmount(D('15.5'))).toBe('15.50');
  });
});

describe('phone numbers', () => {
  it('normalizes local and international formats', () => {
    expect(normalizeMobile('0599123456')).toBe('0599123456');
    expect(normalizeMobile('+970 599 123 456')).toBe('0599123456');
    expect(normalizeMobile('00970599123456')).toBe('0599123456');
    expect(normalizeMobile('٠٥٩٩١٢٣٤٥٦')).toBe('0599123456');
    expect(normalizeMobile('599123456')).toBe('0599123456');
    expect(normalizeMobile('12345')).toBeNull();
  });

  it('builds wa.me digits with the country code', () => {
    expect(toWhatsAppNumber('0599123456')).toBe('970599123456');
    expect(toWhatsAppNumber('+972 52 123 4567')).toBe('972521234567');
  });
});

describe('slugify', () => {
  it('keeps Arabic letters and strips diacritics', () => {
    expect(slugify('صينية جبصين  دائرية!')).toBe('صينية-جبصين-دائرية');
    expect(slugify('مَوْلود')).toBe('مولود');
  });
});

describe('order status transitions', () => {
  it('prevents changes to final states', () => {
    expect(allowedTransitions('COMPLETED', 'DELIVERY')).toEqual([]);
    expect(allowedTransitions('CANCELLED', 'PICKUP')).toEqual([]);
  });
  it('only delivery orders go out for delivery; pickup orders are collected from READY', () => {
    expect(allowedTransitions('READY', 'DELIVERY')).toEqual(['OUT_FOR_DELIVERY', 'CANCELLED']);
    expect(allowedTransitions('READY', 'PICKUP')).toEqual(['COMPLETED', 'CANCELLED']);
  });
});

describe('WhatsApp message', () => {
  const order: WhatsAppOrder = {
    orderNumber: 'BZ-2026-0001',
    createdAt: new Date('2026-10-29T10:00:00Z'),
    customerNameSnapshot: 'أحمد محمد',
    customerPhoneSnapshot: '0599123456',
    recipientName: null,
    recipientPhone: null,
    deliveryMethod: 'DELIVERY',
    deliveryAddress: 'شارع رفيديا الرئيسي',
    deliveryArea: 'نابلس - رفيديا',
    deliveryFee: D('10'),
    pickupLocation: null,
    pickupTime: null,
    subtotal: D('80'),
    total: D('90'),
    totalQuantity: 12,
    customerNotes: 'يرجى التواصل قبل التوصيل.',
    items: [
      { productNameSnapshot: 'صينية جبصين دائرية', quantity: 2, unitPrice: D('15'), subtotal: D('30'), variantSnapshot: null, customizationSnapshot: null },
      {
        productNameSnapshot: 'توزيعات مواليد',
        quantity: 10,
        unitPrice: D('5'),
        subtotal: D('50'),
        variantSnapshot: { name: 'اللون', value: 'ذهبي' },
        customizationSnapshot: [{ label: 'اسم الطفل', value: 'زيد' }],
      },
    ],
  };

  it('contains every order detail from the saved order', () => {
    const msg = buildCustomerOrderMessage(order);
    for (const expected of [
      'مرحباً بصمة زيد 🌸',
      'رقم الطلب: BZ-2026-0001',
      'اسم العميل: أحمد محمد',
      'رقم الهاتف: 0599123456',
      '1. صينية جبصين دائرية',
      'الكمية: 2',
      'سعر القطعة: 15 شيكل',
      'الإجمالي: 30 شيكل',
      'اللون: ذهبي',
      'اسم الطفل: زيد',
      'إجمالي الكمية: 12 قطعة',
      'إجمالي المنتجات: 80 شيكل',
      'رسوم التوصيل: 10 شيكل',
      'الإجمالي النهائي: 90 شيكل',
      'طريقة الاستلام: توصيل',
      'المنطقة: نابلس - رفيديا',
      'ملاحظات: يرجى التواصل قبل التوصيل.',
      'شكراً لكم 🌷',
    ]) {
      expect(msg).toContain(expected);
    }
  });

  it('encodes the message into a wa.me link', () => {
    const msg = buildCustomerOrderMessage(order);
    const url = buildWhatsAppUrl('970599000000', msg)!;
    expect(url.startsWith('https://wa.me/970599000000?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1])).toBe(msg);
  });

  it('returns no link when the business number is not configured', () => {
    expect(buildWhatsAppUrl('', 'x')).toBeNull();
  });
});
