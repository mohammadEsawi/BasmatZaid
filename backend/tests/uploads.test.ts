import { rm } from 'node:fs/promises';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { uploadRoot } from '../src/services/storage.js';
import { app, createAdmin, loginAs, resetDb } from './helpers.js';

let ctx: Awaited<ReturnType<typeof loginAs>>;

beforeEach(async () => {
  await resetDb();
  ctx = await loginAs((await createAdmin()).email);
});

afterAll(async () => {
  await rm(uploadRoot, { recursive: true, force: true });
});

const upload = (buffer: Buffer, filename: string, contentType: string) =>
  ctx.agent.post('/api/admin/uploads').set('X-CSRF-Token', ctx.csrf).field('folder', 'products').attach('file', buffer, { filename, contentType });

describe('image uploads', () => {
  it('stores a valid image re-encoded as WebP and serves it', async () => {
    const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#E9DDCF' } }).png().toBuffer();
    const res = await upload(png, 'photo.png', 'image/png');
    expect(res.status).toBe(201);
    expect(res.body.data.url).toMatch(/^\/uploads\/products\/[\w-]+\.webp$/);

    const served = await request(app).get(res.body.data.url);
    expect(served.status).toBe(200);
    expect((await sharp(served.body).metadata()).format).toBe('webp');
  });

  it('rejects files that only claim to be images', async () => {
    const res = await upload(Buffer.from('<script>alert(1)</script>'), 'evil.png', 'image/png');
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('ليس صورة صالحة');
  });

  it('rejects disallowed file types', async () => {
    const res = await upload(Buffer.from('<svg/>'), 'x.svg', 'image/svg+xml');
    expect(res.status).toBe(400);
  });

  it('requires authentication', async () => {
    expect((await request(app).post('/api/admin/uploads')).status).toBe(401);
  });
});
