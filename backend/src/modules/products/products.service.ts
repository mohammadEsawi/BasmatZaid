import { MovementType, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/http.js';
import { moneyString, toDecimal, unitPriceFor } from '../../utils/money.js';
import { paginate, paged, paginationSchema } from '../../utils/pagination.js';
import { randomSuffix, slugify } from '../../utils/slug.js';
import { booleanQuery, idSchema, imageUrlSchema, moneySchema, optionalText, signedMoneySchema, sortDirSchema } from '../../validators/common.js';

export const productInclude = {
  category: { select: { id: true, name: true, slug: true, isActive: true } },
  images: { orderBy: { sortOrder: 'asc' } },
  variants: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
  customFields: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.ProductInclude;

export type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof productInclude }>;
export type Availability = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

function availabilityOf(quantity: number, threshold: number): Availability {
  if (quantity <= 0) return 'OUT_OF_STOCK';
  if (quantity <= threshold) return 'LOW_STOCK';
  return 'IN_STOCK';
}

/** Stock for a product: its own quantity, or the sum of its active variants. */
export function stockInfo(p: Pick<ProductWithRelations, 'stockQuantity' | 'lowStockThreshold' | 'variants'>) {
  const activeVariants = p.variants.filter((v) => v.isActive);
  const hasVariants = activeVariants.length > 0;
  const available = hasVariants ? activeVariants.reduce((sum, v) => sum + v.stockQuantity, 0) : p.stockQuantity;
  return { hasVariants, available, availability: availabilityOf(available, p.lowStockThreshold) };
}

export function toPublicProduct(p: ProductWithRelations) {
  const stock = stockInfo(p);
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    price: moneyString(p.price),
    discountPrice: moneyString(p.discountPrice),
    effectivePrice: moneyString(unitPriceFor(p.price, p.discountPrice)),
    stockQuantity: stock.available,
    availability: stock.availability,
    lowStockThreshold: p.lowStockThreshold,
    isFeatured: p.isFeatured,
    allowCustomization: p.allowCustomization,
    category: { id: p.category.id, name: p.category.name, slug: p.category.slug },
    images: p.images.map((i) => ({ id: i.id, imageUrl: i.imageUrl, altText: i.altText })),
    hasVariants: stock.hasVariants,
    variants: p.variants
      .filter((v) => v.isActive)
      .map((v) => ({
        id: v.id,
        name: v.name,
        value: v.value,
        priceAdjustment: moneyString(v.priceAdjustment),
        unitPrice: moneyString(unitPriceFor(p.price, p.discountPrice, v.priceAdjustment)),
        stockQuantity: v.stockQuantity,
        availability: availabilityOf(v.stockQuantity, p.lowStockThreshold),
      })),
    customFields: p.allowCustomization
      ? p.customFields.map((f) => ({ id: f.id, label: f.label, fieldType: f.fieldType, options: f.options, isRequired: f.isRequired, maxLength: f.maxLength }))
      : [],
    createdAt: p.createdAt,
  };
}

export function toAdminProduct(p: ProductWithRelations) {
  const stock = stockInfo(p);
  return {
    ...toPublicProduct(p),
    sku: p.sku,
    isActive: p.isActive,
    categoryId: p.categoryId,
    category: p.category,
    ownStockQuantity: p.stockQuantity,
    variants: p.variants.map((v) => ({
      ...v,
      priceAdjustment: moneyString(v.priceAdjustment),
      unitPrice: moneyString(unitPriceFor(p.price, p.discountPrice, v.priceAdjustment)),
      availability: availabilityOf(v.stockQuantity, p.lowStockThreshold),
    })),
    customFields: p.customFields,
    availability: stock.availability,
    updatedAt: p.updatedAt,
  };
}

/** Products that customers can see and order. */
export const publicProductWhere: Prisma.ProductWhereInput = { isActive: true, deletedAt: null, category: { isActive: true } };

export const publicProductQuerySchema = paginationSchema.extend({
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
  category: z.string().max(120).optional(),
  search: z.string().trim().max(100).optional(),
  featured: booleanQuery,
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'name']).default('newest'),
});

export async function listPublicProducts(q: z.infer<typeof publicProductQuerySchema>) {
  const where: Prisma.ProductWhereInput = {
    ...publicProductWhere,
    ...(q.category ? { category: { slug: q.category, isActive: true } } : {}),
    ...(q.featured !== undefined ? { isFeatured: q.featured } : {}),
    ...(q.search
      ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { description: { contains: q.search, mode: 'insensitive' } }] }
      : {}),
  };
  const orderBy: Prisma.ProductOrderByWithRelationInput[] = {
    newest: [{ createdAt: 'desc' as const }],
    price_asc: [{ price: 'asc' as const }],
    price_desc: [{ price: 'desc' as const }],
    name: [{ name: 'asc' as const }],
  }[q.sort];

  const [items, total] = await Promise.all([
    prisma.product.findMany({ where, orderBy, include: productInclude, ...paginate(q.page, q.pageSize) }),
    prisma.product.count({ where }),
  ]);
  return paged(items.map(toPublicProduct), total, q.page, q.pageSize);
}

// ---------------- Admin ----------------

const variantInput = z.object({
  id: idSchema.optional(),
  name: z.string().trim().min(1, 'اسم الخيار مطلوب').max(60),
  value: z.string().trim().min(1, 'قيمة الخيار مطلوبة').max(60),
  priceAdjustment: signedMoneySchema.default('0'),
  stockQuantity: z.coerce.number().int().min(0, 'الكمية لا يمكن أن تكون سالبة').max(1_000_000).default(0),
  sku: optionalText(64),
  isActive: z.boolean().default(true),
});

const customFieldInput = z
  .object({
    label: z.string().trim().min(1, 'اسم الحقل مطلوب').max(60),
    fieldType: z.enum(['TEXT', 'TEXTAREA', 'SELECT']).default('TEXT'),
    options: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
    isRequired: z.boolean().default(false),
    maxLength: z.coerce.number().int().min(1).max(500).default(100),
  })
  .refine((f) => f.fieldType !== 'SELECT' || f.options.length > 0, { message: 'حقل الاختيار يحتاج خيارات', path: ['options'] });

export const productInputSchema = z
  .object({
    name: z.string().trim().min(2, 'اسم المنتج مطلوب').max(150),
    slug: z.string().trim().max(120).optional().nullable(),
    description: optionalText(5000),
    categoryId: idSchema,
    price: moneySchema,
    discountPrice: moneySchema.optional().nullable().or(z.literal('').transform(() => null)),
    /** Initial stock — only applied when creating. Later changes go through the stock endpoint. */
    stockQuantity: z.coerce.number().int().min(0).max(1_000_000).default(0),
    lowStockThreshold: z.coerce.number().int().min(0).max(100_000).default(5),
    sku: optionalText(64),
    isActive: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
    allowCustomization: z.boolean().default(false),
    images: z.array(z.object({ imageUrl: imageUrlSchema, altText: optionalText(150) })).max(10, 'الحد الأقصى 10 صور').default([]),
    variants: z.array(variantInput).max(50).default([]),
    customFields: z.array(customFieldInput).max(10).default([]),
  })
  .superRefine((p, ctx) => {
    if (p.discountPrice && toDecimal(p.discountPrice).gte(toDecimal(p.price))) {
      ctx.addIssue({ code: 'custom', path: ['discountPrice'], message: 'سعر الخصم يجب أن يكون أقل من السعر الأصلي' });
    }
    const seen = new Set<string>();
    p.variants.forEach((v, i) => {
      const k = `${v.name}|${v.value}`;
      if (seen.has(k)) ctx.addIssue({ code: 'custom', path: ['variants', i, 'value'], message: 'هذا الخيار مكرر' });
      seen.add(k);
    });
  });

export type ProductInput = z.infer<typeof productInputSchema>;

export const adminProductQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  categoryId: idSchema.optional(),
  status: z.enum(['active', 'inactive']).optional(),
  stock: z.enum(['in', 'low', 'out']).optional(),
  featured: booleanQuery,
  sort: z.enum(['createdAt', 'name', 'price', 'stock']).default('createdAt'),
  dir: sortDirSchema,
});

export async function listAdminProducts(q: z.infer<typeof adminProductQuerySchema>) {
  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    ...(q.status ? { isActive: q.status === 'active' } : {}),
    ...(q.featured !== undefined ? { isFeatured: q.featured } : {}),
    ...(q.search
      ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { sku: { contains: q.search, mode: 'insensitive' } }] }
      : {}),
  };

  const needsInMemory = q.stock !== undefined || q.sort === 'stock';
  if (!needsInMemory) {
    const orderBy = { [q.sort]: q.dir } as Prisma.ProductOrderByWithRelationInput;
    const [items, total] = await Promise.all([
      prisma.product.findMany({ where, orderBy, include: productInclude, ...paginate(q.page, q.pageSize) }),
      prisma.product.count({ where }),
    ]);
    return paged(items.map(toAdminProduct), total, q.page, q.pageSize);
  }

  // Stock depends on variants, so filtering/sorting by it is done in memory
  // (fine for a boutique catalog of a few thousand products at most).
  const all = (await prisma.product.findMany({ where, include: productInclude, orderBy: { createdAt: 'desc' } })).map(toAdminProduct);
  const filtered = q.stock
    ? all.filter((p) => ({ in: p.availability === 'IN_STOCK', low: p.availability === 'LOW_STOCK', out: p.availability === 'OUT_OF_STOCK' })[q.stock!])
    : all;
  if (q.sort === 'stock') filtered.sort((a, b) => (q.dir === 'asc' ? a.stockQuantity - b.stockQuantity : b.stockQuantity - a.stockQuantity));
  const { skip, take } = paginate(q.page, q.pageSize);
  return paged(filtered.slice(skip, skip + take), filtered.length, q.page, q.pageSize);
}

async function uniqueProductSlug(base: string, excludeId?: string) {
  const slug = slugify(base) || `product-${randomSuffix()}`;
  const taken = await prisma.product.findFirst({ where: { slug, NOT: excludeId ? { id: excludeId } : undefined }, select: { id: true } });
  return taken ? `${slug}-${randomSuffix()}` : slug;
}

async function assertCategory(categoryId: string) {
  const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } });
  if (!category) throw ApiError.badRequest('التصنيف المختار غير موجود', [{ path: 'categoryId', message: 'التصنيف غير موجود' }]);
}

const productFields = (data: ProductInput) => ({
  name: data.name,
  description: data.description,
  categoryId: data.categoryId,
  price: data.price,
  discountPrice: data.discountPrice ?? null,
  lowStockThreshold: data.lowStockThreshold,
  sku: data.sku,
  isActive: data.isActive,
  isFeatured: data.isFeatured,
  allowCustomization: data.allowCustomization,
});

const customFieldRows = (data: ProductInput) =>
  data.customFields.map((f, i) => ({ ...f, options: f.fieldType === 'SELECT' ? f.options : [], sortOrder: i }));

export async function createProduct(data: ProductInput, adminUserId: string) {
  await assertCategory(data.categoryId);
  const slug = await uniqueProductSlug(data.slug || data.name);

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        ...productFields(data),
        slug,
        stockQuantity: data.variants.length ? 0 : data.stockQuantity,
        images: { create: data.images.map((img, i) => ({ imageUrl: img.imageUrl, altText: img.altText, sortOrder: i })) },
        customFields: { create: customFieldRows(data) },
        variants: {
          create: data.variants.map((v, i) => ({
            name: v.name,
            value: v.value,
            priceAdjustment: v.priceAdjustment,
            stockQuantity: v.stockQuantity,
            sku: v.sku,
            isActive: v.isActive,
            sortOrder: i,
          })),
        },
      },
      include: { variants: true },
    });

    const initial = created.variants.length
      ? created.variants.filter((v) => v.stockQuantity > 0).map((v) => ({ variantId: v.id, qty: v.stockQuantity }))
      : created.stockQuantity > 0
        ? [{ variantId: null, qty: created.stockQuantity }]
        : [];
    if (initial.length) {
      await tx.inventoryMovement.createMany({
        data: initial.map((m) => ({
          productId: created.id,
          variantId: m.variantId,
          adminUserId,
          movementType: MovementType.INITIAL_STOCK,
          quantityChange: m.qty,
          previousQuantity: 0,
          newQuantity: m.qty,
          reason: 'المخزون الافتتاحي عند إضافة المنتج',
        })),
      });
    }
    return created;
  });

  return getAdminProduct(product.id);
}

export async function updateProduct(id: string, data: ProductInput, adminUserId: string) {
  const current = await prisma.product.findFirst({ where: { id, deletedAt: null }, include: { variants: true } });
  if (!current) throw ApiError.notFound('المنتج غير موجود');
  await assertCategory(data.categoryId);

  const slug = data.slug && slugify(data.slug) !== current.slug ? await uniqueProductSlug(data.slug, id) : current.slug;
  const existingIds = new Set(current.variants.map((v) => v.id));
  for (const v of data.variants) {
    if (v.id && !existingIds.has(v.id)) throw ApiError.badRequest('أحد الخيارات لا ينتمي لهذا المنتج');
  }
  const keptIds = new Set(data.variants.flatMap((v) => (v.id ? [v.id] : [])));

  await prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id }, data: { ...productFields(data), slug } });

    await tx.productImage.deleteMany({ where: { productId: id } });
    if (data.images.length) {
      await tx.productImage.createMany({ data: data.images.map((img, i) => ({ productId: id, imageUrl: img.imageUrl, altText: img.altText, sortOrder: i })) });
    }

    await tx.productCustomField.deleteMany({ where: { productId: id } });
    if (data.customFields.length) await tx.productCustomField.createMany({ data: customFieldRows(data).map((f) => ({ ...f, productId: id })) });

    // Removed variants: order items keep their snapshot, so deleting is safe.
    await tx.productVariant.deleteMany({ where: { productId: id, id: { notIn: [...keptIds] } } });

    for (const [i, v] of data.variants.entries()) {
      const fields = { name: v.name, value: v.value, priceAdjustment: v.priceAdjustment, sku: v.sku, isActive: v.isActive, sortOrder: i };
      if (v.id) {
        // Stock of existing variants is changed only through the audited stock endpoint.
        await tx.productVariant.update({ where: { id: v.id }, data: fields });
      } else {
        const created = await tx.productVariant.create({ data: { ...fields, productId: id, stockQuantity: v.stockQuantity } });
        if (v.stockQuantity > 0) {
          await tx.inventoryMovement.create({
            data: {
              productId: id,
              variantId: created.id,
              adminUserId,
              movementType: MovementType.INITIAL_STOCK,
              quantityChange: v.stockQuantity,
              previousQuantity: 0,
              newQuantity: v.stockQuantity,
              reason: 'مخزون خيار جديد',
            },
          });
        }
      }
    }
  });

  return getAdminProduct(id);
}

export async function getAdminProduct(id: string) {
  const product = await prisma.product.findFirst({ where: { id, deletedAt: null }, include: productInclude });
  if (!product) throw ApiError.notFound('المنتج غير موجود');
  return toAdminProduct(product);
}

/**
 * Products that appear in orders are archived (hidden everywhere) so historical orders stay
 * intact; products that were never ordered are removed completely.
 */
export async function deleteProduct(id: string) {
  const product = await prisma.product.findFirst({ where: { id, deletedAt: null }, include: { _count: { select: { orderItems: true } } } });
  if (!product) throw ApiError.notFound('المنتج غير موجود');

  if (product._count.orderItems > 0) {
    await prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, isFeatured: false, sku: null, slug: `${product.slug}-archived-${randomSuffix()}` },
    });
    return { archived: true };
  }
  await prisma.product.delete({ where: { id } });
  return { archived: false };
}
