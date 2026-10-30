import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { app, createAdmin, createArea, createCategory, createProduct, customer, loginAs, pickupOrder, prisma, resetDb } from './helpers.js';

let categoryId: string;

beforeEach(async () => {
  await resetDb();
  categoryId = (await createCategory()).id;
  await prisma.storeSettings.create({ data: { key: 'business', value: { whatsappNumber: '970599000000' } } });
});

const placeOrder = (body: object) => request(app).post('/api/orders').send(body);

describe('order creation & pricing', () => {
  it('saves the order with prices calculated on the backend and deducts stock', async () => {
    const tray = await createProduct(categoryId, { name: 'صينية جبصين دائرية', price: '15', stockQuantity: 20 });
    const favors = await createProduct(categoryId, { name: 'توزيعات مواليد', price: '6', discountPrice: '5', stockQuantity: 100 });

    const res = await placeOrder({
      ...pickupOrder([
        { productId: tray.id, quantity: 2 },
        { productId: favors.id, quantity: 10 },
      ]),
      // Attempted tampering: these fields must be ignored.
      total: '1',
      subtotal: '1',
      items: [
        { productId: tray.id, quantity: 2, unitPrice: '0.01' },
        { productId: favors.id, quantity: 10, price: '0' },
      ],
    });

    expect(res.status).toBe(201);
    const order = res.body.data;
    expect(order.orderNumber).toMatch(/^BZ-\d{4}-0001$/);
    expect(order.subtotal).toBe('80.00');
    expect(order.deliveryFee).toBe('0.00');
    expect(order.total).toBe('80.00');
    expect(order.totalQuantity).toBe(12);
    expect(order.items.map((i: { unitPrice: string }) => i.unitPrice)).toEqual(['15.00', '5.00']);
    expect(order.trackingToken).toBeTruthy();

    expect((await prisma.product.findUniqueOrThrow({ where: { id: tray.id } })).stockQuantity).toBe(18);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: favors.id } })).stockQuantity).toBe(90);

    const saved = await prisma.order.findUniqueOrThrow({ where: { orderNumber: order.orderNumber }, include: { items: true, inventoryMovements: true, customer: true } });
    expect(saved.inventoryStatus).toBe('DEDUCTED');
    expect(saved.items).toHaveLength(2);
    expect(saved.inventoryMovements.map((m) => m.quantityChange).sort()).toEqual([-10, -2]);
    expect(saved.customer.phone).toBe('0599123456');
  });

  it('numbers orders sequentially', async () => {
    const p = await createProduct(categoryId, { stockQuantity: 10 });
    const a = await placeOrder(pickupOrder([{ productId: p.id, quantity: 1 }]));
    const b = await placeOrder(pickupOrder([{ productId: p.id, quantity: 1 }]));
    expect(a.body.data.orderNumber.endsWith('-0001')).toBe(true);
    expect(b.body.data.orderNumber.endsWith('-0002')).toBe(true);
  });

  it('applies the configured delivery fee of the selected area', async () => {
    const p = await createProduct(categoryId, { price: '15', stockQuantity: 10 });
    const near = await createArea('نابلس - رفيديا', '10');
    const far = await createArea('الخليل', '25.50');
    const base = { customer, items: [{ productId: p.id, quantity: 2 }], deliveryMethod: 'DELIVERY', deliveryAddress: 'شارع رفيديا، عمارة 5' };

    const q1 = await request(app).post('/api/orders/quote').send({ ...base, deliveryAreaId: near.id });
    expect(q1.body.data).toMatchObject({ subtotal: '30.00', deliveryFee: '10.00', total: '40.00' });

    const res = await placeOrder({ ...base, deliveryAreaId: far.id, deliveryFee: '0' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ subtotal: '30.00', deliveryFee: '25.50', total: '55.50', deliveryArea: 'الخليل' });
  });

  it('rejects delivery without a valid area or address', async () => {
    const p = await createProduct(categoryId);
    const area = await createArea();
    await prisma.deliveryArea.update({ where: { id: area.id }, data: { isActive: false } });
    const res = await placeOrder({ customer, items: [{ productId: p.id, quantity: 1 }], deliveryMethod: 'DELIVERY', deliveryAreaId: area.id, deliveryAddress: 'نابلس شارع 1' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('منطقة التوصيل المختارة غير متاحة');

    const noAddress = await placeOrder({ customer, items: [{ productId: p.id, quantity: 1 }], deliveryMethod: 'DELIVERY', deliveryAreaId: area.id });
    expect(noAddress.status).toBe(400);
  });

  it('enforces the minimum delivery order amount', async () => {
    const p = await createProduct(categoryId, { price: '10' });
    const area = await createArea();
    await prisma.storeSettings.create({ data: { key: 'delivery', value: { minOrderAmount: '50' } } });
    const res = await placeOrder({ customer, items: [{ productId: p.id, quantity: 1 }], deliveryMethod: 'DELIVERY', deliveryAreaId: area.id, deliveryAddress: 'نابلس شارع 1' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('الحد الأدنى');
  });

  it('validates customer data', async () => {
    const p = await createProduct(categoryId);
    const res = await placeOrder({ customer: { name: 'أ', phone: '123' }, items: [{ productId: p.id, quantity: 1 }], deliveryMethod: 'PICKUP' });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { path: string }) => e.path)).toEqual(expect.arrayContaining(['customer.name', 'customer.phone']));
  });

  it('uses variant prices and stock', async () => {
    const p = await createProduct(categoryId, { price: '6', stockQuantity: 0 });
    const gold = await prisma.productVariant.create({ data: { productId: p.id, name: 'اللون', value: 'ذهبي', priceAdjustment: '1.5', stockQuantity: 5 } });

    const missingVariant = await placeOrder(pickupOrder([{ productId: p.id, quantity: 1 }]));
    expect(missingVariant.status).toBe(400);

    const res = await placeOrder(pickupOrder([{ productId: p.id, variantId: gold.id, quantity: 2 }]));
    expect(res.status).toBe(201);
    expect(res.body.data.items[0].unitPrice).toBe('7.50');
    expect(res.body.data.total).toBe('15.00');
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: gold.id } })).stockQuantity).toBe(3);
  });

  it('validates required customization fields and stores the values', async () => {
    const p = await createProduct(categoryId);
    await prisma.product.update({ where: { id: p.id }, data: { allowCustomization: true } });
    const field = await prisma.productCustomField.create({ data: { productId: p.id, label: 'اسم الطفل', isRequired: true, maxLength: 20 } });

    const missing = await placeOrder(pickupOrder([{ productId: p.id, quantity: 1 }]));
    expect(missing.status).toBe(400);
    expect(missing.body.message).toContain('اسم الطفل');

    const res = await placeOrder(pickupOrder([{ productId: p.id, quantity: 1, customization: [{ fieldId: field.id, value: 'زيد' }] }]));
    expect(res.status).toBe(201);
    expect(res.body.data.items[0].customization).toEqual([{ label: 'اسم الطفل', value: 'زيد' }]);
    expect(decodeURIComponent(res.body.data.whatsappUrl)).toContain('اسم الطفل: زيد');
  });
});

describe('stock validation', () => {
  it('rejects quantities above available stock with a clear message', async () => {
    const p = await createProduct(categoryId, { name: 'صينية', stockQuantity: 3 });
    const res = await placeOrder(pickupOrder([{ productId: p.id, quantity: 4 }]));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OUT_OF_STOCK');
    expect(res.body.message).toBe('الكمية المطلوبة من "صينية" غير متوفرة. المتوفر حالياً: 3');
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQuantity).toBe(3);
    expect(await prisma.order.count()).toBe(0);
  });

  it('combines split lines of the same product when checking stock', async () => {
    const p = await createProduct(categoryId, { stockQuantity: 5 });
    const res = await placeOrder(pickupOrder([{ productId: p.id, quantity: 3 }, { productId: p.id, quantity: 3 }]));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OUT_OF_STOCK');
  });

  it('rejects inactive, out-of-stock and unknown products', async () => {
    const inactive = await createProduct(categoryId, { isActive: false });
    const empty = await createProduct(categoryId, { name: 'فازة', stockQuantity: 0 });
    expect((await placeOrder(pickupOrder([{ productId: inactive.id, quantity: 1 }]))).status).toBe(400);
    const out = await placeOrder(pickupOrder([{ productId: empty.id, quantity: 1 }]));
    expect(out.status).toBe(400);
    expect(out.body.message).toBe('المنتج "فازة" نفد من المخزون');
    expect((await placeOrder(pickupOrder([{ productId: 'does-not-exist', quantity: 1 }]))).status).toBe(400);
  });

  it('never oversells under concurrent orders', async () => {
    const p = await createProduct(categoryId, { stockQuantity: 5 });
    const attempts = 12;
    const results = await Promise.all(
      Array.from({ length: attempts }, () => placeOrder({ ...pickupOrder([{ productId: p.id, quantity: 1 }]), idempotencyKey: randomUUID() })),
    );
    const succeeded = results.filter((r) => r.status === 201).length;
    const rejected = results.filter((r) => r.status === 409 || r.status === 400);

    expect(succeeded).toBe(5);
    expect(rejected).toHaveLength(attempts - 5);
    rejected.forEach((r) => expect(r.body.code).toBe('OUT_OF_STOCK'));
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQuantity).toBe(0);
    expect(await prisma.order.count()).toBe(5);
    expect(await prisma.inventoryMovement.count({ where: { movementType: 'ORDER_DEDUCTION' } })).toBe(5);
  });
});

describe('duplicate order prevention', () => {
  it('returns the same order when the request is retried with the same key', async () => {
    const p = await createProduct(categoryId, { stockQuantity: 10 });
    const body = { ...pickupOrder([{ productId: p.id, quantity: 2 }]), idempotencyKey: randomUUID() };

    const first = await placeOrder(body);
    const retry = await placeOrder(body);
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.data.orderNumber).toBe(first.body.data.orderNumber);
    expect(await prisma.order.count()).toBe(1);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQuantity).toBe(8);
  });

  it('creates only one order for simultaneous double-clicks', async () => {
    const p = await createProduct(categoryId, { stockQuantity: 10 });
    const body = { ...pickupOrder([{ productId: p.id, quantity: 1 }]), idempotencyKey: randomUUID() };
    const results = await Promise.all([placeOrder(body), placeOrder(body), placeOrder(body)]);
    const numbers = new Set(results.map((r) => r.body.data?.orderNumber));
    expect(numbers.size).toBe(1);
    expect(await prisma.order.count()).toBe(1);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQuantity).toBe(9);
  });
});

describe('order status & cancellation', () => {
  async function setup() {
    const admin = await createAdmin();
    const session = await loginAs(admin.email);
    const p = await createProduct(categoryId, { stockQuantity: 10 });
    const res = await placeOrder(pickupOrder([{ productId: p.id, quantity: 4 }]));
    const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber: res.body.data.orderNumber } });
    const setStatus = (status: string, note?: string) =>
      session.agent.patch(`/api/admin/orders/${order.id}/status`).set('X-CSRF-Token', session.csrf).send({ status, note });
    return { ...session, admin, product: p, order, setStatus };
  }

  it('records status history with the responsible admin', async () => {
    const { setStatus, order, admin, agent } = await setup();
    expect((await setStatus('CONFIRMED')).status).toBe(200);
    expect((await setStatus('PREPARING')).status).toBe(200);
    const details = await agent.get(`/api/admin/orders/${order.id}`);
    const history = details.body.data.statusHistory;
    expect(history.map((h: { newStatus: string }) => h.newStatus)).toEqual(['NEW', 'CONFIRMED', 'PREPARING']);
    expect(history[2]).toMatchObject({ previousStatus: 'CONFIRMED', admin: { id: admin.id } });
  });

  it('blocks invalid transitions', async () => {
    const { setStatus } = await setup();
    const skip = await setStatus('COMPLETED');
    expect(skip.status).toBe(400);
    expect(skip.body.code).toBe('INVALID_TRANSITION');
    expect((await setStatus('OUT_FOR_DELIVERY')).status).toBe(400); // pickup order
  });

  it('restores stock exactly once on cancellation', async () => {
    const { setStatus, product, order } = await setup();
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(6);

    const cancel = await setStatus('CANCELLED', 'طلب الزبون');
    expect(cancel.status).toBe(200);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(10);

    const again = await setStatus('CANCELLED');
    expect(again.status).toBe(400);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(10);

    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved.inventoryStatus).toBe('RESTORED');
    expect(await prisma.inventoryMovement.count({ where: { orderId: order.id, movementType: 'ORDER_CANCELLATION_RESTORE' } })).toBe(1);
  });

  it('does not restore stock for orders that never deducted it', async () => {
    const { setStatus, product, order } = await setup();
    await prisma.order.update({ where: { id: order.id }, data: { inventoryStatus: 'NONE' } });
    await setStatus('CANCELLED');
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(6);
  });

  it('cannot cancel a completed order', async () => {
    const { setStatus } = await setup();
    for (const s of ['CONFIRMED', 'PREPARING', 'READY', 'COMPLETED']) expect((await setStatus(s)).status).toBe(200);
    expect((await setStatus('CANCELLED')).status).toBe(400);
  });
});

describe('order tracking & WhatsApp', () => {
  it('exposes the order only with the tracking token or the matching phone', async () => {
    const p = await createProduct(categoryId, { stockQuantity: 10 });
    const res = await placeOrder(pickupOrder([{ productId: p.id, quantity: 1 }], { notes: 'سري' }));
    const { orderNumber, trackingToken } = res.body.data;

    expect((await request(app).get(`/api/orders/track/${orderNumber}?token=${trackingToken}`)).status).toBe(200);
    expect((await request(app).get(`/api/orders/track/${orderNumber}?phone=%2B970599123456`)).status).toBe(200);
    expect((await request(app).get(`/api/orders/track/${orderNumber}?token=wrong`)).status).toBe(404);
    expect((await request(app).get(`/api/orders/track/${orderNumber}?phone=0599999999`)).status).toBe(404);
    expect((await request(app).get(`/api/orders/track/${orderNumber}`)).status).toBe(400);

    const tracked = await request(app).get(`/api/orders/track/${orderNumber}?token=${trackingToken}`);
    expect(tracked.body.data.adminNotes).toBeUndefined();
  });

  it('builds the WhatsApp link from the saved order and the configured business number', async () => {
    const p = await createProduct(categoryId, { name: 'صينية جبصين دائرية', price: '15', stockQuantity: 10 });
    const res = await placeOrder(pickupOrder([{ productId: p.id, quantity: 2 }]));
    const url: string = res.body.data.whatsappUrl;
    expect(url.startsWith('https://wa.me/970599000000?text=')).toBe(true);
    const text = decodeURIComponent(url.split('text=')[1]);
    expect(text).toContain(`رقم الطلب: ${res.body.data.orderNumber}`);
    expect(text).toContain('صينية جبصين دائرية');
    expect(text).toContain('الإجمالي النهائي: 30 شيكل');
    expect(text).toContain('طريقة الاستلام: استلام من الموقع');
  });

  it('gives admins a link to message the customer phone stored in the order', async () => {
    const admin = await createAdmin();
    const { agent } = await loginAs(admin.email);
    const p = await createProduct(categoryId, { stockQuantity: 10 });
    const res = await placeOrder(pickupOrder([{ productId: p.id, quantity: 1 }]));
    const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber: res.body.data.orderNumber } });
    const details = await agent.get(`/api/admin/orders/${order.id}`);
    expect(details.body.data.whatsapp.toCustomerUrl.startsWith('https://wa.me/970599123456?text=')).toBe(true);
  });

  it('refuses orders while the store is not accepting them', async () => {
    const p = await createProduct(categoryId, { stockQuantity: 10 });
    await prisma.storeSettings.create({ data: { key: 'store', value: { acceptingOrders: false } } });
    const res = await placeOrder(pickupOrder([{ productId: p.id, quantity: 1 }]));
    expect(res.status).toBe(503);
    expect(await prisma.order.count()).toBe(0);
  });
});
