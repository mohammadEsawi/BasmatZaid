import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AlertTriangle, ShoppingBag, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/misc';
import { EmptyState, ProductImage, QuantityStepper } from '@/components/store/ProductBits';
import { useCart } from '@/features/cart/CartContext';
import { lineProblem, lineSubtotalAgorot, quantityForStockRow } from '@/features/cart/cartLogic';
import { agorotToString, formatShekel } from '@/lib/money';
import { storefront } from '@/services/storefront';

export default function CartPage() {
  const { items, totalQuantity, subtotalAgorot, updateQuantity, removeItem, applyServerCheck } = useCart();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const checked = useRef(false);

  // Refresh prices and stock from the server once when the cart opens.
  useEffect(() => {
    if (checked.current || items.length === 0) return;
    checked.current = true;
    setChecking(true);
    storefront
      .cartCheck(items.map((i) => ({ productId: i.productId, variantId: i.variantId })))
      .then(applyServerCheck)
      .catch(() => undefined)
      .finally(() => setChecking(false));
  }, [items, applyServerCheck]);

  if (items.length === 0) {
    return (
      <div className="container max-w-3xl py-16">
        <EmptyState icon={ShoppingBag} title="سلة التسوق فارغة" description="لم تقم بإضافة أي منتج بعد. تصفّح قطعنا اليدوية واختار اللي بيعجبك.">
          <Button asChild size="lg"><Link to="/products">تصفح المنتجات</Link></Button>
        </EmptyState>
      </div>
    );
  }

  const hasProblems = items.some((i) => lineProblem(i, items));

  return (
    <div className="container py-8 md:py-12">
      <h1 className="mb-6 font-display text-3xl font-semibold text-charcoal">سلة التسوق</h1>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {items.map((item) => {
            const problem = lineProblem(item, items);
            return (
              <div key={item.key} className="flex gap-4 rounded-2xl border border-border/60 bg-white p-3 shadow-soft sm:p-4">
                <Link to={`/products/${item.slug}`} className="size-24 shrink-0 overflow-hidden rounded-xl bg-ivory sm:size-28">
                  <ProductImage src={item.image} alt={item.name} className="size-full" />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/products/${item.slug}`} className="font-semibold leading-snug text-charcoal hover:text-cocoa">{item.name}</Link>
                    <button onClick={() => removeItem(item.key)} className="rounded-full p-1.5 text-muted-foreground transition hover:bg-red-50 hover:text-destructive" aria-label="إزالة من السلة">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  {item.variantLabel && <p className="text-xs text-muted-foreground">{item.variantLabel}</p>}
                  {item.customization.map((c) => <p key={c.fieldId} className="text-xs text-muted-foreground">{c.label}: <span className="text-charcoal">{c.value}</span></p>)}
                  {item.customNote && <p className="text-xs text-muted-foreground">ملاحظات: <span className="text-charcoal">{item.customNote}</span></p>}
                  <p className="text-sm text-muted-foreground">سعر القطعة: <span className="text-charcoal">{formatShekel(item.unitPrice)}</span></p>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
                    <QuantityStepper
                      size="sm"
                      value={item.quantity}
                      max={Math.max(1, item.maxQuantity - quantityForStockRow(items, item.productId, item.variantId, item.key))}
                      onChange={(q) => {
                        const r = updateQuantity(item.key, q);
                        if (!r.ok) toast.error(r.message);
                      }}
                    />
                    <span className="font-semibold text-cocoa">{formatShekel(agorotToString(lineSubtotalAgorot(item)))}</span>
                  </div>
                  {problem && (
                    <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-destructive">
                      <AlertTriangle className="size-3.5 shrink-0" /> {problem}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <Card className="lg:sticky lg:top-28">
          <CardHeader><CardTitle>ملخص السلة</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">عدد القطع</span><span>{totalQuantity}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">إجمالي المنتجات</span><span className="font-semibold">{formatShekel(agorotToString(subtotalAgorot))}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>رسوم التوصيل</span><span>تُحسب عند إتمام الطلب</span></div>
            <Separator />
            <Button size="lg" className="w-full" disabled={hasProblems || checking} loading={checking} onClick={() => navigate('/checkout')}>
              متابعة لإتمام الطلب
            </Button>
            {hasProblems && <p className="text-center text-xs text-destructive">يرجى تعديل المنتجات غير المتوفرة قبل المتابعة</p>}
            <Button asChild variant="ghost" className="w-full"><Link to="/products">متابعة التسوق</Link></Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
