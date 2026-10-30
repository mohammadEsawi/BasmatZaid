import express, { Router } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { requireAdmin, requireCsrf } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { uploadRoot } from './services/storage.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { adminCategoriesRouter, publicCategoriesRouter } from './modules/categories/categories.routes.js';
import { adminCustomersRouter } from './modules/customers/customers.routes.js';
import { adminDashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { adminDeliveryRouter } from './modules/delivery/delivery.routes.js';
import { adminInventoryRouter } from './modules/inventory/inventory.routes.js';
import { adminOrdersRouter, publicOrdersRouter } from './modules/orders/orders.routes.js';
import { adminProductsRouter, publicProductsRouter } from './modules/products/products.routes.js';
import { adminSettingsRouter, publicSettingsRouter } from './modules/settings/settings.routes.js';
import { uploadsRouter } from './modules/uploads/uploads.routes.js';
import { prisma } from './lib/prisma.js';
import { ok } from './utils/http.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  if (env.TRUST_PROXY > 0) app.set('trust proxy', env.TRUST_PROXY);

  app.use(
    helmet({
      // Product images are loaded by the storefront from another origin in split deployments.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || env.corsOrigins.includes(origin)),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  // Locally stored images. Files are re-encoded WebP with random names, so they are safe to serve.
  app.use(
    '/uploads',
    express.static(uploadRoot, {
      maxAge: '30d',
      immutable: true,
      index: false,
      dotfiles: 'deny',
      setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
    }),
  );

  app.get('/api/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    ok(res, { status: 'ok' });
  });

  const api = Router();
  api.use(apiLimiter);

  // Public storefront API
  api.use('/products', publicProductsRouter);
  api.use('/categories', publicCategoriesRouter);
  api.use('/settings', publicSettingsRouter);
  api.use('/orders', publicOrdersRouter);

  // Admin API — every route below requires a valid session and, for writes, the CSRF token.
  api.use('/admin/auth', authRouter);
  const admin = Router();
  admin.use(requireAdmin, requireCsrf);
  admin.use('/dashboard', adminDashboardRouter);
  admin.use('/products', adminProductsRouter);
  admin.use('/categories', adminCategoriesRouter);
  admin.use('/inventory', adminInventoryRouter);
  admin.use('/orders', adminOrdersRouter);
  admin.use('/customers', adminCustomersRouter);
  admin.use('/delivery-areas', adminDeliveryRouter);
  admin.use('/settings', adminSettingsRouter);
  admin.use('/uploads', uploadsRouter);
  api.use('/admin', admin);

  app.use('/api', api);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
