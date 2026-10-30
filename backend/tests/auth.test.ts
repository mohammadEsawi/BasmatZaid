import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { ADMIN_PASSWORD, app, createAdmin, createCategory, loginAs, resetDb } from './helpers.js';

beforeEach(resetDb);

describe('admin authentication', () => {
  it('logs in with email or username and sets an HTTP-only cookie', async () => {
    await createAdmin('OWNER', 'owner@test.local');
    const res = await request(app).post('/api/admin/auth/login').send({ identifier: 'owner@test.local', password: ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.csrfToken).toBeTruthy();
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('bz_admin_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toMatch(/SameSite=Lax/i);

    const byUsername = await request(app).post('/api/admin/auth/login').send({ identifier: 'owner', password: ADMIN_PASSWORD });
    expect(byUsername.status).toBe(200);
  });

  it('rejects wrong credentials with an Arabic message', async () => {
    await createAdmin();
    const res = await request(app).post('/api/admin/auth/login').send({ identifier: 'owner@test.local', password: 'wrong-password-1' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('بيانات الدخول غير صحيحة');
    const unknown = await request(app).post('/api/admin/auth/login').send({ identifier: 'nobody@test.local', password: 'x' });
    expect(unknown.status).toBe(401);
  });

  it('rejects inactive admins', async () => {
    const admin = await createAdmin();
    const { prisma } = await import('./helpers.js');
    await prisma.adminUser.update({ where: { id: admin.id }, data: { isActive: false } });
    const res = await request(app).post('/api/admin/auth/login').send({ identifier: admin.email, password: ADMIN_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('returns the current admin and invalidates the session on logout', async () => {
    const admin = await createAdmin();
    const { agent } = await loginAs(admin.email);
    const me = await agent.get('/api/admin/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.admin.email).toBe(admin.email);
    expect(me.body.data.admin.passwordHash).toBeUndefined();

    await agent.post('/api/admin/auth/logout');
    expect((await agent.get('/api/admin/auth/me')).status).toBe(401);
  });
});

describe('admin authorization', () => {
  it('blocks every admin API without a session', async () => {
    for (const path of ['/api/admin/products', '/api/admin/orders', '/api/admin/customers', '/api/admin/settings', '/api/admin/dashboard/stats', '/api/admin/inventory']) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(401);
    }
    expect((await request(app).post('/api/admin/products').send({})).status).toBe(401);
  });

  it('rejects forged session cookies', async () => {
    const res = await request(app).get('/api/admin/products').set('Cookie', 'bz_admin_session=forged-token');
    expect(res.status).toBe(401);
  });

  it('requires the CSRF token for state-changing requests', async () => {
    const admin = await createAdmin();
    const category = await createCategory();
    const { agent, csrf } = await loginAs(admin.email);
    const body = { name: 'منتج', categoryId: category.id, price: '10' };

    const without = await agent.post('/api/admin/products').send(body);
    expect(without.status).toBe(403);
    const wrong = await agent.post('/api/admin/products').set('X-CSRF-Token', 'nope').send(body);
    expect(wrong.status).toBe(403);
    const withToken = await agent.post('/api/admin/products').set('X-CSRF-Token', csrf).send(body);
    expect(withToken.status).toBe(201);
  });

  it('enforces roles: staff cannot manage the catalogue or settings', async () => {
    const staff = await createAdmin('STAFF', 'staff@test.local');
    const category = await createCategory();
    const { agent, csrf } = await loginAs(staff.email);
    expect((await agent.get('/api/admin/products')).status).toBe(200);
    const create = await agent.post('/api/admin/products').set('X-CSRF-Token', csrf).send({ name: 'منتج', categoryId: category.id, price: '10' });
    expect(create.status).toBe(403);
    const settings = await agent.put('/api/admin/settings').set('X-CSRF-Token', csrf).send({ store: { acceptingOrders: false } });
    expect(settings.status).toBe(403);
  });
});
