/**
 * Seeds base data: settings, categories, delivery areas and the first admin (from env).
 * With SEED_DEMO_DATA=true it also adds demo products with generated placeholder images
 * — intended for local development only.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { prisma } from '../src/lib/prisma.js';
import { ensureAdmin } from '../src/scripts/create-admin.js';
import { uploadRoot } from '../src/services/storage.js';
import { getSettings, updateSettings } from '../src/modules/settings/settings.service.js';

const categories = [
  { name: 'جبصين', slug: 'gypsum', description: 'قطع جبصين ديكورية مصنوعة يدوياً', sortOrder: 1 },
  { name: 'توزيعات', slug: 'favors', description: 'توزيعات أعراس وخطوبة ومواليد', sortOrder: 2 },
  { name: 'ديكورات', slug: 'decor', description: 'صواني وديكورات وقطع للبيت', sortOrder: 3 },
  { name: 'قوالب', slug: 'molds', description: 'قوالب جبصين وشوكولاتة وحلويات', sortOrder: 4 },
  { name: 'هدايا', slug: 'gifts', description: 'هدايا أعياد الميلاد والمناسبات', sortOrder: 5 },
  { name: 'منتجات مخصصة', slug: 'custom', description: 'قطع بالاسم والتاريخ والتصميم اللي بدك ياه', sortOrder: 6 },
];

const deliveryAreas = [
  { name: 'نابلس - داخل المدينة', deliveryFee: '10', estimatedDeliveryTime: 'خلال يوم إلى يومين', sortOrder: 1 },
  { name: 'نابلس - القرى المحيطة', deliveryFee: '15', estimatedDeliveryTime: 'خلال 2-3 أيام', sortOrder: 2 },
  { name: 'رام الله والبيرة', deliveryFee: '20', estimatedDeliveryTime: 'خلال 2-4 أيام', sortOrder: 3 },
  { name: 'جنين وطولكرم وقلقيلية', deliveryFee: '20', estimatedDeliveryTime: 'خلال 2-4 أيام', sortOrder: 4 },
  { name: 'الخليل وبيت لحم', deliveryFee: '25', estimatedDeliveryTime: 'خلال 3-5 أيام', sortOrder: 5 },
  { name: 'الداخل المحتل', deliveryFee: '70', estimatedDeliveryTime: 'خلال 3-6 أيام', sortOrder: 6 },
];

const PALETTE = ['#E9DDCF', '#F3ECE3', '#E4D3C1', '#EFE6DA'];

/** Simple, brand-coloured placeholder artwork so the demo catalogue doesn't look empty. */
async function placeholderImage(label: string, index: number) {
  const bg = PALETTE[index % PALETTE.length];
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900">
    <rect width="900" height="900" fill="${bg}"/>
    <circle cx="450" cy="400" r="${190 + (index % 3) * 20}" fill="#FAF7F2" stroke="#A68A72" stroke-width="6"/>
    <circle cx="450" cy="400" r="${130 + (index % 2) * 15}" fill="none" stroke="#80644F" stroke-width="3" stroke-dasharray="6 14"/>
    <path d="M450 300 C 500 340, 500 460, 450 500 C 400 460, 400 340, 450 300 Z" fill="#A68A72" opacity="0.55"/>
    <text x="450" y="760" font-family="Tahoma, Arial" font-size="54" fill="#39332F" text-anchor="middle">${label}</text>
  </svg>`;
  const dir = path.join(uploadRoot, 'products');
  await mkdir(dir, { recursive: true });
  const file = `${randomUUID()}.webp`;
  await writeFile(path.join(dir, file), await sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer());
  return `/uploads/products/${file}`;
}

async function seedDemoProducts() {
  if ((await prisma.product.count()) > 0) {
    console.log('Products already exist — skipping demo products.');
    return;
  }
  const cat = Object.fromEntries((await prisma.category.findMany()).map((c) => [c.slug, c.id]));
  const demo = [
    { name: 'صينية جبصين دائرية', slug: 'round-gypsum-tray', category: 'decor', price: '15', stock: 12, featured: true, description: 'صينية جبصين دائرية بلمسة يدوية ناعمة، مثالية لتقديم التوزيعات أو كديكور على الطاولة. قطر 25 سم.' },
    { name: 'توزيعات مواليد بالاسم', slug: 'baby-favors-named', category: 'favors', price: '5', stock: 120, featured: true, customize: true, description: 'قطع جبصين صغيرة مع اسم المولود وتاريخ الولادة، مغلفة بشريطة ستان. السعر للقطعة الواحدة.' },
    { name: 'شمعة جبصين معطرة', slug: 'scented-gypsum-candle', category: 'gifts', price: '25', discount: '20', stock: 4, featured: true, description: 'وعاء جبصين مصنوع يدوياً مع شمعة صويا معطرة. هدية رقيقة لكل المناسبات.' },
    { name: 'قالب سيليكون للجبصين - ورود', slug: 'roses-silicone-mold', category: 'molds', price: '35', stock: 8, description: 'قالب سيليكون عالي الجودة لصب قطع الجبصين أو الشوكولاتة على شكل ورود.' },
    { name: 'لوحة جبصين بالاسم', slug: 'gypsum-name-plaque', category: 'custom', price: '45', stock: 10, featured: true, customize: true, description: 'لوحة جبصين بإطار ذهبي مع الاسم أو العبارة التي تختارها. مناسبة لغرف الأطفال والمداخل.' },
    { name: 'فازة جبصين مضلعة', slug: 'ribbed-gypsum-vase', category: 'gypsum', price: '30', stock: 0, description: 'فازة جبصين بتصميم مضلع عصري، مناسبة للورد المجفف.' },
    { name: 'توزيعات خطوبة - قلوب', slug: 'engagement-hearts-favors', category: 'favors', price: '6', stock: 200, variants: true, description: 'قطع جبصين على شكل قلب مع حروف العروسين. اختاري اللون المناسب لثيم المناسبة.' },
    { name: 'قالب شوكولاتة للتوزيعات', slug: 'chocolate-favor-mold', category: 'molds', price: '28', stock: 15, description: 'قالب لتقديم الشوكولاتة والحلو بطريقة أنيقة في المناسبات.' },
  ];

  for (const [i, p] of demo.entries()) {
    const image = await placeholderImage(p.name, i);
    const product = await prisma.product.create({
      data: {
        name: p.name,
        slug: p.slug,
        description: p.description,
        categoryId: cat[p.category],
        price: p.price,
        discountPrice: p.discount ?? null,
        stockQuantity: p.variants ? 0 : p.stock,
        lowStockThreshold: 5,
        isFeatured: p.featured ?? false,
        allowCustomization: p.customize ?? false,
        sku: `BZ-${String(i + 1).padStart(3, '0')}`,
        images: { create: [{ imageUrl: image, altText: p.name, sortOrder: 0 }] },
        customFields: p.customize
          ? {
              create: [
                { label: p.category === 'favors' ? 'اسم الطفل' : 'الاسم أو العبارة', fieldType: 'TEXT', isRequired: true, maxLength: 40, sortOrder: 0 },
                { label: 'لون الشريطة', fieldType: 'SELECT', options: ['أبيض', 'ذهبي', 'زهري', 'أزرق'], sortOrder: 1 },
              ],
            }
          : undefined,
        variants: p.variants
          ? {
              create: [
                { name: 'اللون', value: 'أبيض', priceAdjustment: '0', stockQuantity: 120, sortOrder: 0 },
                { name: 'اللون', value: 'ذهبي', priceAdjustment: '1', stockQuantity: 60, sortOrder: 1 },
                { name: 'اللون', value: 'وردي', priceAdjustment: '0.5', stockQuantity: 3, sortOrder: 2 },
              ],
            }
          : undefined,
      },
      include: { variants: true },
    });
    const movements = product.variants.length
      ? product.variants.map((v) => ({ variantId: v.id, qty: v.stockQuantity }))
      : product.stockQuantity > 0
        ? [{ variantId: null, qty: product.stockQuantity }]
        : [];
    await prisma.inventoryMovement.createMany({
      data: movements.map((m) => ({
        productId: product.id,
        variantId: m.variantId,
        movementType: 'INITIAL_STOCK' as const,
        quantityChange: m.qty,
        previousQuantity: 0,
        newQuantity: m.qty,
        reason: 'بيانات تجريبية',
      })),
    });
  }
  console.log(`Created ${demo.length} demo products.`);
}

async function main() {
  for (const c of categories) {
    await prisma.category.upsert({ where: { slug: c.slug }, create: c, update: {} });
  }
  if ((await prisma.deliveryArea.count()) === 0) {
    await prisma.deliveryArea.createMany({ data: deliveryAreas });
  }

  const current = await getSettings();
  if ((await prisma.storeSettings.count()) === 0) {
    await updateSettings({
      business: { ...current.business, address: 'نابلس - فلسطين' },
      delivery: { ...current.delivery, pickupLocation: 'نابلس - رفيديا (يتم إرسال الموقع بالتفصيل عبر واتساب)', pickupInstructions: 'يرجى التواصل قبل الحضور للتأكد من جاهزية الطلب.' },
      store: current.store,
      content: current.content,
      social: current.social,
    });
  }

  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) await ensureAdmin({ quiet: false });
  else console.log('ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin creation. Run `npm run admin:create` later.');

  if (process.env.SEED_DEMO_DATA === 'true') await seedDemoProducts();
  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
