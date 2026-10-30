import { Router } from 'express';
import { requireRole } from '../../middleware/auth.js';
import { ok } from '../../utils/http.js';
import { prisma } from '../../lib/prisma.js';
import { moneyString } from '../../utils/money.js';
import { getSettings, toPublicSettings, updateSettings, updateSettingsSchema } from './settings.service.js';

export const publicSettingsRouter = Router();

publicSettingsRouter.get('/public', async (_req, res) => {
  const [settings, areas] = await Promise.all([
    getSettings(),
    prisma.deliveryArea.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
  ]);
  ok(res, {
    ...toPublicSettings(settings),
    deliveryAreas: areas.map((a) => ({
      id: a.id,
      name: a.name,
      deliveryFee: moneyString(a.deliveryFee),
      estimatedDeliveryTime: a.estimatedDeliveryTime,
    })),
  });
});

export const adminSettingsRouter = Router();

adminSettingsRouter.get('/', async (_req, res) => {
  ok(res, await getSettings());
});

adminSettingsRouter.put('/', requireRole('ADMIN'), async (req, res) => {
  const input = updateSettingsSchema.parse(req.body);
  ok(res, await updateSettings(input), 'تم حفظ الإعدادات');
});
