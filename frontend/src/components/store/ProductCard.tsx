import { Link, useNavigate } from 'react-router';
import { Eye, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { useCart } from '@/features/cart/CartContext';
import { formatShekel } from '@/lib/money';
import type { Product } from '@/types';
import { Price, ProductImage, StockBadge } from './ProductBits';

export function ProductCard({ product }: { product: Product }) {
  const { addItem } = useCart();
  const navigate = useNavigate();
  const outOfStock = product.availability === 'OUT_OF_STOCK';
  // Products with options or required personalization are configured on the details page.
  const needsOptions = product.hasVariants || product.customFields.some((f) => f.isRequired);

  const handleAdd = () => {
    if (needsOptions) {
      navigate(`/products/${product.slug}`);
      return;
    }
    const result = addItem(
      {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        image: product.images[0]?.imageUrl ?? null,
        variantId: null,
        variantLabel: null,
        unitPrice: product.effectivePrice,
        maxQuantity: product.stockQuantity,
        customization: [],
        customNote: null,
      },
      1,
    );
    if (result.ok) toast.success('تمت الإضافة إلى السلة', { description: product.name, action: { label: 'عرض السلة', onClick: () => navigate('/cart') } });
    else toast.error(result.message);
  };

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-white shadow-soft transition duration-300 hover:-translate-y-0.5 hover:shadow-lift">
      <Link to={`/products/${product.slug}`} className="relative block aspect-square overflow-hidden bg-ivory">
        <ProductImage src={product.images[0]?.imageUrl} alt={product.images[0]?.altText || product.name} className="size-full transition duration-500 group-hover:scale-[1.03]" />
        <div className="absolute right-3 top-3 flex flex-col items-start gap-1.5">
          <StockBadge availability={product.availability} quantity={product.stockQuantity} />
          {product.discountPrice && <span className="rounded-full bg-cocoa px-2.5 py-0.5 text-xs font-medium text-white">خصم</span>}
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <Link to={`/category/${product.category.slug}`} className="text-xs font-medium text-taupe hover:text-cocoa">
          {product.category.name}
        </Link>
        <h3 className="line-clamp-2 min-h-[2.75rem] font-sans text-[15px] font-semibold leading-snug text-charcoal">
          <Link to={`/products/${product.slug}`} className="hover:text-cocoa">
            {product.name}
          </Link>
        </h3>

        {product.hasVariants ? (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">يبدأ من</p>
            <span className="text-lg font-semibold text-cocoa">{formatShekel(minVariantPrice(product))}</span>
            <div className="flex flex-wrap gap-1 pt-1">
              {product.variants.slice(0, 4).map((v) => (
                <span key={v.id} className={`rounded-full border px-2 py-0.5 text-[11px] ${v.stockQuantity > 0 ? 'border-border text-charcoal' : 'border-dashed border-border text-muted-foreground line-through'}`}>
                  {v.value}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <Price price={product.price} discountPrice={product.discountPrice} />
        )}

        <p className="text-xs text-muted-foreground">
          {outOfStock ? 'غير متوفر حالياً' : <>الكمية المتوفرة: <span className="ltr-nums font-medium text-charcoal">{product.stockQuantity}</span></>}
        </p>

        <div className="mt-auto grid grid-cols-[1fr_auto] gap-2 pt-2">
          <Button onClick={handleAdd} disabled={outOfStock} size="sm" className="h-10">
            <ShoppingBag />
            {outOfStock ? 'نفد المخزون' : needsOptions ? 'اختر الخيارات' : 'أضف للسلة'}
          </Button>
          <Button asChild variant="outline" size="icon" className="size-10" aria-label="عرض التفاصيل">
            <Link to={`/products/${product.slug}`}>
              <Eye />
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

function minVariantPrice(product: Product) {
  const prices = product.variants.map((v) => v.unitPrice);
  return prices.reduce((min, p) => (Number(p) < Number(min) ? p : min), prices[0] ?? product.effectivePrice);
}

export function ProductGrid({ products, loading, count = 8 }: { products?: Product[]; loading?: boolean; count?: number }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-border/60 bg-white">
            <Skeleton className="aspect-square rounded-none" />
            <div className="space-y-2 p-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-10 w-full rounded-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
      {products?.map((p) => <ProductCard key={p.id} product={p} />)}
    </div>
  );
}
