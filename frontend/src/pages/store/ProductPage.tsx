import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ShoppingBag, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/misc';
import { EmptyState, Price, ProductImage, QuantityStepper, StockBadge } from '@/components/store/ProductBits';
import { ProductGrid } from '@/components/store/ProductCard';
import { useCart } from '@/features/cart/CartContext';
import { quantityForStockRow } from '@/features/cart/cartLogic';
import { agorotToString, formatShekel, toAgorot } from '@/lib/money';
import { errorMessage } from '@/services/api';
import { storefront } from '@/services/storefront';
import { cn } from '@/lib/utils';
import type { ProductDetails } from '@/types';

export default function ProductPage() {
  const { slug = '' } = useParams();
  const query = useQuery({ queryKey: ['product', slug], queryFn: () => storefront.product(slug) });

  if (query.isLoading) {
    return (
      <div className="container grid gap-8 py-10 md:grid-cols-2">
        <Skeleton className="aspect-square" />
        <div className="space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="container py-16">
        <EmptyState title="المنتج غير موجود" description={errorMessage(query.error, 'ربما تم حذفه أو أصبح غير متاح')}>
          <Button asChild><Link to="/products">تصفح المنتجات</Link></Button>
        </EmptyState>
      </div>
    );
  }
  return <ProductView key={query.data.id} product={query.data} />;
}

function ProductView({ product }: { product: ProductDetails }) {
  const { items, addItem } = useCart();
  const navigate = useNavigate();
  const [activeImage, setActiveImage] = useState(0);
  const [variantId, setVariantId] = useState<string | null>(() => product.variants.find((v) => v.stockQuantity > 0)?.id ?? null);
  const [quantity, setQuantity] = useState(1);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [customNote, setCustomNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const variant = product.variants.find((v) => v.id === variantId) ?? null;
  const unitPrice = variant ? variant.unitPrice : product.effectivePrice;
  const stock = product.hasVariants ? variant?.stockQuantity ?? 0 : product.stockQuantity;
  const inCart = quantityForStockRow(items, product.id, product.hasVariants ? variantId : null);
  const canAdd = Math.max(0, stock - inCart);
  const availability = product.hasVariants ? variant?.availability ?? 'OUT_OF_STOCK' : product.availability;

  useEffect(() => {
    setQuantity((q) => Math.min(Math.max(q, 1), Math.max(canAdd, 1)));
  }, [canAdd]);

  // Variants grouped by option name (e.g. "اللون").
  const groups = useMemo(() => {
    const map = new Map<string, typeof product.variants>();
    product.variants.forEach((v) => map.set(v.name, [...(map.get(v.name) ?? []), v]));
    return [...map.entries()];
  }, [product.variants]);

  const handleAdd = (goToCart = false) => {
    const nextErrors: Record<string, string> = {};
    if (product.hasVariants && !variant) nextErrors.variant = 'يرجى اختيار أحد الخيارات';
    for (const f of product.customFields) {
      const v = (custom[f.id] ?? '').trim();
      if (f.isRequired && !v) nextErrors[f.id] = `يرجى تعبئة "${f.label}"`;
      else if (v.length > f.maxLength) nextErrors[f.id] = `الحد الأقصى ${f.maxLength} حرفاً`;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const result = addItem(
      {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        image: product.images[0]?.imageUrl ?? null,
        variantId: variant?.id ?? null,
        variantLabel: variant ? `${variant.name}: ${variant.value}` : null,
        unitPrice,
        maxQuantity: stock,
        customization: product.customFields
          .filter((f) => (custom[f.id] ?? '').trim())
          .map((f) => ({ fieldId: f.id, label: f.label, value: custom[f.id].trim() })),
        customNote: product.allowCustomization && customNote.trim() ? customNote.trim() : null,
      },
      quantity,
    );
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    if (goToCart) navigate('/cart');
    else toast.success('تمت الإضافة إلى السلة', { description: `${product.name} × ${quantity}`, action: { label: 'عرض السلة', onClick: () => navigate('/cart') } });
  };

  const images = product.images.length ? product.images : [{ id: 'placeholder', imageUrl: '', altText: product.name }];

  return (
    <div className="container py-8 md:py-12">
      <nav className="mb-6 text-xs text-muted-foreground">
        <Link to="/" className="hover:text-cocoa">الرئيسية</Link> / <Link to={`/category/${product.category.slug}`} className="hover:text-cocoa">{product.category.name}</Link> / <span>{product.name}</span>
      </nav>

      <div className="grid gap-8 md:grid-cols-2 lg:gap-14">
        {/* Gallery */}
        <div className="space-y-3">
          <div className="aspect-square overflow-hidden rounded-3xl border border-border/60 bg-white shadow-soft">
            <ProductImage src={images[activeImage]?.imageUrl} alt={images[activeImage]?.altText || product.name} className="size-full" />
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {images.map((img, i) => (
                <button key={img.id} onClick={() => setActiveImage(i)} className={cn('size-20 shrink-0 overflow-hidden rounded-xl border-2 bg-white transition', i === activeImage ? 'border-cocoa' : 'border-transparent opacity-70 hover:opacity-100')} aria-label={`صورة ${i + 1}`}>
                  <ProductImage src={img.imageUrl} alt="" className="size-full" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-6">
          <div className="space-y-3">
            <Link to={`/category/${product.category.slug}`} className="text-sm font-medium text-taupe hover:text-cocoa">{product.category.name}</Link>
            <h1 className="font-display text-3xl font-semibold leading-snug text-charcoal md:text-4xl">{product.name}</h1>
            {variant ? <span className="block text-3xl font-semibold text-cocoa">{formatShekel(unitPrice)}</span> : <Price price={product.price} discountPrice={product.discountPrice} size="lg" />}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <StockBadge availability={availability} />
              <span className="text-muted-foreground">الكمية المتوفرة: <span className="ltr-nums font-semibold text-charcoal">{stock}</span></span>
            </div>
          </div>

          {groups.map(([name, options]) => (
            <div key={name} className="space-y-2.5">
              <p className="text-sm font-medium text-charcoal">{name}: <span className="text-cocoa">{variant?.name === name ? variant.value : ''}</span></p>
              <div className="flex flex-wrap gap-2">
                {options.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    disabled={v.stockQuantity <= 0}
                    onClick={() => setVariantId(v.id)}
                    className={cn(
                      'rounded-full border px-4 py-2 text-sm transition',
                      v.id === variantId ? 'border-cocoa bg-cocoa text-white' : 'border-border bg-white hover:border-taupe',
                      v.stockQuantity <= 0 && 'cursor-not-allowed border-dashed opacity-50 line-through',
                    )}
                  >
                    {v.value}
                    <span className={cn('ms-1.5 text-xs', v.id === variantId ? 'text-white/80' : 'text-muted-foreground')}>{formatShekel(v.unitPrice)} · {v.stockQuantity > 0 ? `${v.stockQuantity} متوفر` : 'نفد'}</span>
                  </button>
                ))}
              </div>
              {errors.variant && <p className="text-xs text-destructive">{errors.variant}</p>}
            </div>
          ))}

          {product.allowCustomization && (
            <div className="space-y-4 rounded-2xl border border-taupe/25 bg-beige/25 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-cocoa"><Sparkles className="size-4" /> خصّص قطعتك</p>
              {product.customFields.map((f) => (
                <FormField key={f.id} label={f.label} htmlFor={`cf-${f.id}`} required={f.isRequired} error={errors[f.id]}>
                  {f.fieldType === 'SELECT' ? (
                    <NativeSelect id={`cf-${f.id}`} value={custom[f.id] ?? ''} onChange={(e) => setCustom({ ...custom, [f.id]: e.target.value })} aria-invalid={!!errors[f.id]}>
                      <option value="">اختر...</option>
                      {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                    </NativeSelect>
                  ) : f.fieldType === 'TEXTAREA' ? (
                    <Textarea id={`cf-${f.id}`} maxLength={f.maxLength} value={custom[f.id] ?? ''} onChange={(e) => setCustom({ ...custom, [f.id]: e.target.value })} aria-invalid={!!errors[f.id]} />
                  ) : (
                    <Input id={`cf-${f.id}`} maxLength={f.maxLength} value={custom[f.id] ?? ''} onChange={(e) => setCustom({ ...custom, [f.id]: e.target.value })} aria-invalid={!!errors[f.id]} />
                  )}
                </FormField>
              ))}
              <FormField label="ملاحظات إضافية للتخصيص" htmlFor="custom-note" hint="مثلاً: نوع الخط، تاريخ المناسبة، أو أي تفصيل بتحبيه">
                <Textarea id="custom-note" maxLength={300} value={customNote} onChange={(e) => setCustomNote(e.target.value)} className="min-h-[72px]" />
              </FormField>
            </div>
          )}

          <div className="space-y-3 rounded-2xl border border-border/60 bg-white p-4 shadow-soft">
            {stock > 0 ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-medium">الكمية</span>
                  <QuantityStepper value={quantity} max={Math.max(canAdd, 1)} onChange={setQuantity} />
                </div>
                {inCart > 0 && <p className="text-xs text-muted-foreground">لديك {inCart} من هذا المنتج في السلة. يمكنك إضافة {canAdd} أخرى.</p>}
                <div className="flex items-center justify-between border-t border-border/60 pt-3 text-sm">
                  <span className="text-muted-foreground">المجموع</span>
                  <span className="font-semibold text-charcoal">{formatShekel(agorotToString(toAgorot(unitPrice) * quantity))}</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button size="lg" onClick={() => handleAdd()} disabled={canAdd <= 0}>
                    <ShoppingBag /> أضف إلى السلة
                  </Button>
                  <Button size="lg" variant="dark" onClick={() => handleAdd(true)} disabled={canAdd <= 0}>
                    اطلب الآن
                  </Button>
                </div>
              </>
            ) : (
              <p className="py-2 text-center text-sm font-medium text-destructive">{product.hasVariants && !variant ? 'كل الخيارات نفدت حالياً' : 'هذا المنتج نفد من المخزون حالياً'}</p>
            )}
          </div>

          {product.description && (
            <div className="space-y-2">
              <h2 className="font-display text-lg font-semibold">وصف المنتج</h2>
              <p className="whitespace-pre-line leading-8 text-charcoal/75">{product.description}</p>
            </div>
          )}
        </div>
      </div>

      {product.related.length > 0 && (
        <section className="mt-16">
          <h2 className="section-title mb-6">منتجات مشابهة</h2>
          <ProductGrid products={product.related} />
        </section>
      )}
    </div>
  );
}
