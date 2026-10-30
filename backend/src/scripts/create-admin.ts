/**
 * Secure admin bootstrap. Creates (or with --reset-password, updates) an admin account from
 * environment variables. There is no default password and no public registration page.
 *
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run admin:create
 *   npm run admin:create -- --reset-password
 */
import { prisma } from '../lib/prisma.js';
import { hashPassword, validatePasswordStrength } from '../modules/auth/auth.service.js';

export async function ensureAdmin({ resetPassword = false, quiet = false } = {}) {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || 'مدير المتجر';
  const username = process.env.ADMIN_USERNAME?.trim().toLowerCase() || null;

  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set to create the admin account.');
  }
  const weak = validatePasswordStrength(password);
  if (weak) throw new Error(`ADMIN_PASSWORD rejected: ${weak}`);
  if (process.env.NODE_ENV === 'production' && /BasmatZaid-Dev/i.test(password)) {
    throw new Error('Refusing to use the development example password in production.');
  }

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    if (!resetPassword) {
      if (!quiet) console.log(`Admin ${email} already exists (use --reset-password to change the password).`);
      return existing;
    }
    const updated = await prisma.adminUser.update({ where: { email }, data: { passwordHash: await hashPassword(password), isActive: true } });
    await prisma.adminSession.deleteMany({ where: { adminUserId: updated.id } });
    console.log(`Password reset for ${email}; all existing sessions were revoked.`);
    return updated;
  }

  const admin = await prisma.adminUser.create({
    data: { email, username, name, role: 'OWNER', passwordHash: await hashPassword(password) },
  });
  console.log(`Created OWNER admin ${email}${username ? ` (username: ${username})` : ''}.`);
  return admin;
}

const isDirectRun = process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/create-admin.ts') || process.argv[1]?.endsWith('create-admin.js');
if (isDirectRun) {
  ensureAdmin({ resetPassword: process.argv.includes('--reset-password') })
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
