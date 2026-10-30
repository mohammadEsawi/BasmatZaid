import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app, createAdmin, createCategory, loginAs, pickupOrder, prisma, resetDb } from './helpers.js';

let ctx: Awaited<ReturnType<typeof loginAs>> & { categoryId: string; adminId: string };

beforeEach(async () => {
  await resetDb();
  const admin = await createAdmin();
  const category = await createCategory();
  ctx = { ...(await loginAs(admin.email)), categoryId: category.id, adminId: admin.id };
});

const post = (path: string, body: unknown) => ctx.agent.post(path).set('X-CSRF-Token', ctx.csrf).send(body as object);
const put = (path: string, body: unknown) => ctx.agent.put(path).set('X-CSRF-Token', ctx.csrf).send(body as object);
const patch = (path: string, body: unknown) => ctx.agent.patch(path).set('X-CSRF-Token', ctx.csrf).send(body as object);

describe('product management', () => {
  it('creates a product with decimal price and records initial stock', async () => {
    const res = await post('/api/admin/products', {
      name: 'صينية جبصين دائرية',
      categoryId: ctx.categoryId,
      price: '15.50',
      discountPrice: '12',
      stockQuantity: 20,
      sku: 'TRAY-1',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.price).toBe('15.50');
    expect(res.body.data.effectivePrice).toBe('12.00');
    expect(res.body.data.slug).toBe('صينية-جبصين-دائرية');
    expect(res.body.data.stockQuantity).toBe(20);

    const movement = await prisma.inventoryMovement.findFirstOrThrow({ where: { productId: res.body.data.id } });
    expect(movement).toMatchObject({ movementType: 'INITIAL_STOCK', quantityChange: 20, previousQuantity: 0, newQuantity: 20, adminUserId: ctx.adminId });
  });

  it('validates input with Arabic messages', async () => {
    const res = await post('/api/admin/products', { name: 'x', categoryId: ctx.categoryId, price: '-5' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors.length).toBeGreaterThan(0);

    const discount = await post('/api/admin/products', { name: 'منتج', categoryId: ctx.categoryId, price: '10', discountPrice: '15' });
    expect(discount.status).toBe(400);
    expect(discount.body.message).toBe('سعر الخصم يجب أن يكون أقل من السعر الأصلي');
  });

  it('updates a product, its variants and custom fields without touching existing stock', async () => {
    const created = await post('/api/admin/products', {
      name: 'توزيعات قلوب',
      categoryId: ctx.categoryId,
      price: '6',
      variants: [{ name: 'اللون', value: 'أبيض', stockQuantity: 50 }],
    });
    const id = created.body.data.id;
    const white = created.body.data.variants[0];

    const updated = await put(`/api/admin/products/${id}`, {
      name: 'توزيعات قلوب مميزة',
      categoryId: ctx.categoryId,
      price: '7',
      allowCustomization: true,
      customFields: [{ label: 'أسماء العروسين', isRequired: true }],
      variants: [
        { id: white.id, name: 'اللون', value: 'أبيض', stockQuantity: 999 },
        { name: 'اللون', value: 'ذهبي', priceAdjustment: '1', stockQuantity: 10 },
      ],
    });
    expect(updated.status).toBe(200);
    const data = updated.body.data;
    expect(data.name).toBe('توزيعات قلوب مميزة');
    expect(data.price).toBe('7.00');
    expect(data.variants).toHaveLength(2);
    expect(data.variants.find((v: { value: string }) => v.value === 'أبيض').stockQuantity).toBe(50); // unchanged
    expect(data.variants.find((v: { value: string }) => v.value === 'ذهبي').unitPrice).toBe('8.00');
    expect(data.customFields).toHaveLength(1);
    expect(data.stockQuantity).toBe(60);
  });

  it('activates/deactivates and hides inactive products from the store', async () => {
    const created = await post('/api/admin/products', { name: 'فازة', categoryId: ctx.categoryId, price: '30', stockQuantity: 3 });
    const id = created.body.data.id;
    expect((await request(app).get(`/api/products/${created.body.data.slug}`)).status).toBe(200);

    expect((await patch(`/api/admin/products/${id}/status`, { isActive: false })).status).toBe(200);
    expect((await request(app).get(`/api/products/${created.body.data.slug}`)).status).toBe(404);
    const list = await request(app).get('/api/products');
    expect(list.body.data.items).toHaveLength(0);
  });
});

describe('stock changes', () => {
  it('adjusts and sets stock with an audit trail', async () => {
    const created = await post('/api/admin/products', { name: 'صينية', categoryId: ctx.categoryId, price: '15', stockQuantity: 20 });
    const id = created.body.data.id;

    const adjust = await patch(`/api/admin/products/${id}/stock`, { mode: 'adjust', quantity: -3, reason: 'قطع مكسورة' });
    expect(adjust.status).toBe(200);
    expect(adjust.body.data.product.stockQuantity).toBe(17);
    expect(adjust.body.data.movement).toMatchObject({ previousQuantity: 20, newQuantity: 17, quantityChange: -3, reason: 'قطع مكسورة', adminUserId: ctx.adminId });

    const set = await patch(`/api/admin/products/${id}/stock`, { mode: 'set', quantity: 40, reason: 'جرد' });
    expect(set.body.data.product.stockQuantity).toBe(40);
    expect(set.body.data.movement.quantityChange).toBe(23);

    const movements = await ctx.agent.get(`/api/admin/inventory/movements?productId=${id}`);
    expect(movements.body.data.items).toHaveLength(3);
  });

  it('never allows negative stock', async () => {
    const created = await post('/api/admin/products', { name: 'صينية', categoryId: ctx.categoryId, price: '15', stockQuantity: 2 });
    const res = await patch(`/api/admin/products/${created.body.data.id}/stock`, { mode: 'adjust', quantity: -5, reason: 'خطأ' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NEGATIVE_STOCK');
    const product = await prisma.product.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect(product.stockQuantity).toBe(2);
  });
});

describe('product deletion', () => {
  it('archives ordered products so historical orders stay intact', async () => {
    const created = await post('/api/admin/products', { name: 'صينية', categoryId: ctx.categoryId, price: '15', stockQuantity: 5 });
    const id = created.body.data.id;
    const order = await request(app).post('/api/orders').send(pickupOrder([{ productId: id, quantity: 1 }]));
    expect(order.status).toBe(201);

    const del = await ctx.agent.delete(`/api/admin/products/${id}`).set('X-CSRF-Token', ctx.csrf);
    expect(del.body.data.archived).toBe(true);
    const items = await prisma.orderItem.findMany({ where: { productId: id } });
    expect(items).toHaveLength(1);
    expect(items[0].productNameSnapshot).toBe('صينية');
    expect((await ctx.agent.get(`/api/admin/products/${id}`)).status).toBe(404);
  });

  it('removes never-ordered products completely', async () => {
    const created = await post('/api/admin/products', { name: 'صينية', categoryId: ctx.categoryId, price: '15' });
    const del = await ctx.agent.delete(`/api/admin/products/${created.body.data.id}`).set('X-CSRF-Token', ctx.csrf);
    expect(del.body.data.archived).toBe(false);
    expect(await prisma.product.count()).toBe(0);
  });

  it('refuses to delete a category that still has products', async () => {
    await post('/api/admin/products', { name: 'صينية', categoryId: ctx.categoryId, price: '15' });
    const del = await ctx.agent.delete(`/api/admin/categories/${ctx.categoryId}`).set('X-CSRF-Token', ctx.csrf);
    expect(del.status).toBe(409);
  });
});
