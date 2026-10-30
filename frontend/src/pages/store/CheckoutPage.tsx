import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, MapPin, Store, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Separator, Skeleton } from '@/components/ui/misc';
import { ProductImage } from '@/components/store/ProductBits';
import { useCart } from '@/features/cart/CartContext';
import { lineProblem } from '@/features/cart/cartLogic';
import { checkoutSchema, normalizeDigits, type CheckoutValues } from '@/features/checkout/checkoutSchema';
import { usePublicSettings } from '@/hooks/useStore';
import { ApiRequestError, errorMessage } from '@/services/api';
import { storefront } from '@/services/storefront';
import { formatShekel } from '@/lib/money';
import { cn, newIdempotencyKey } from '@/lib/utils';
import type { OrderPayload } from '@/types';

export default function CheckoutPage() {
  const cart = useCart();
  const { data: settings, isLoading: settingsLoading } = usePublicSettings();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // One key per checkout: double clicks and retries can never create two orders.
  const idempotencyKey = useRef(newIdempotencyKey());
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<CheckoutValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { name: '', phone: '', differentRecipient: false, deliveryMethod: 'PICKUP', pickupWhen: 'asap', deliveryAreaId: '', deliveryAddress: '', notes: '' },
  });
  const { register, handleSubmit, setValue, formState: { errors } } = form;
  const [deliveryMethod, deliveryAreaId, pickupWhen, differentRecipient] = useWatch({ control: form.control, name: ['deliveryMethod', 'deliveryAreaId', 'pickupWhen', 'differentRecipient'] });

  // Default to the method that is actually available.
  useEffect(() => {
    if (!settings) return;
    if (!settings.delivery.pickupEnabled && settings.delivery.deliveryEnabled) setValue('deliveryMethod', 'DELIVERY');
  }, [settings, setValue]);

  const items = useMemo(
    () =>
      cart.items.map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
        quantity: i.quantity,
        customization: i.customization.map((c) => ({ fieldId: c.fieldId, value: c.value })),
        customNote: i.customNote,
      })),
    [cart.items],
  );

  // Totals always come from the backend (prices, delivery fee).
  const canQuote = items.length > 0 && (deliveryMethod === 'PICKUP' || !!deliveryAreaId);
  const quote = useQuery({
    queryKey: ['quote', items, deliveryMethod, deliveryAreaId],
    queryFn: () => storefront.quote({ customer: { name: '', phone: '' }, items, deliveryMethod, deliveryAreaId: deliveryMethod === 'DELIVERY' ? deliveryAreaId : null }),
    enabled: canQuote,
    retry: false,
  });

  if (cart.items.length === 0 && !submitting) return <Navigate to="/cart" replace />;

  const onSubmit = async (values: CheckoutValues) => {
    setSubmitError(null);
    const payload: OrderPayload = {
      idempotencyKey: idempotencyKey.current,
      customer: { name: values.name, phone: normalizeDigits(values.phone) },
      recipient: values.differentRecipient ? { name: values.recipientName || null, phone: values.recipientPhone ? normalizeDigits(values.recipientPhone) : null } : null,
      items,
      deliveryMethod: values.deliveryMethod,
      deliveryAreaId: values.deliveryMethod === 'DELIVERY' ? values.deliveryAreaId : null,
      deliveryAddress: values.deliveryMethod === 'DELIVERY' ? values.deliveryAddress : null,
      pickupTime: values.deliveryMethod === 'PICKUP' && values.pickupWhen === 'scheduled' && values.pickupTime ? new Date(values.pickupTime).toISOString() : null,
      notes: values.notes || null,
    };

    setSubmitting(true);
    try {
      const { data: order } = await storefront.createOrder(payload);
      // The order is saved in the database at this point; WhatsApp is only a convenience.
      try {
        sessionStorage.setItem(`bz_order_${order.orderNumber}`, JSON.stringify(order));
      } catch {
        /* ignore */
      }
      cart.clear();
      queryClient.invalidateQueries({ queryKey: ['products'] });
      navigate(`/order/${order.orderNumber}?token=${encodeURIComponent(order.trackingToken)}`, { replace: true });
    } catch (error) {
      setSubmitting(false);
      const message = errorMessage(error, 'تعذر إرسال الطلب، يرجى المحاولة مرة أخرى');
      setSubmitError(message);
      toast.error(message);
      if (error instanceof ApiRequestError && error.code === 'OUT_OF_STOCK') {
        storefront.cartCheck(cart.items.map((i) => ({ productId: i.productId, variantId: i.variantId }))).then(cart.applyServerCheck).catch(() => undefined);
      }
    }
  };

  const delivery = settings?.delivery;
  const areas = settings?.deliveryAreas ?? [];
  const cartProblems = cart.items.some((i) => lineProblem(i, cart.items));
  const storeClosed = settings && (!settings.store.storeOpen || !settings.store.acceptingOrders);
  const minPickupTime = new Date(Date.now() + 60 * 60 * 1000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  return (
    <div className="container py-8 md:py-12">
      <h1 className="mb-6 font-display text-3xl font-semibold text-charcoal">إتمام الطلب</h1>

      {storeClosed && (
        <div className="mb-6 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {settings.store.closedMessage}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid items-start gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>معلومات الزبون</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField label="الاسم الكامل" htmlFor="name" required error={errors.name?.message}>
                <Input id="name" autoComplete="name" {...register('name')} aria-invalid={!!errors.name} />
              </FormField>
              <FormField label="رقم الهاتف" htmlFor="phone" required error={errors.phone?.message} hint="رح نتواصل معك على هذا الرقم">
                <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="05XXXXXXXX" className="text-left" dir="ltr" {...register('phone')} aria-invalid={!!errors.phone} />
              </FormField>
              <label className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" className="size-4 accent-cocoa" {...register('differentRecipient')} />
                المستلم شخص آخر
              </label>
              {differentRecipient && (
                <>
                  <FormField label="اسم المستلم" htmlFor="recipientName" required error={errors.recipientName?.message}>
                    <Input id="recipientName" {...register('recipientName')} aria-invalid={!!errors.recipientName} />
                  </FormField>
                  <FormField label="رقم هاتف المستلم" htmlFor="recipientPhone" error={errors.recipientPhone?.message}>
                    <Input id="recipientPhone" type="tel" dir="ltr" className="text-left" placeholder="05XXXXXXXX" {...register('recipientPhone')} aria-invalid={!!errors.recipientPhone} />
                  </FormField>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>طريقة الاستلام</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              {settingsLoading ? (
                <Skeleton className="h-24" />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <MethodOption icon={Store} title="استلام من الموقع" subtitle="بدون رسوم توصيل" active={deliveryMethod === 'PICKUP'} disabled={!delivery?.pickupEnabled} onSelect={() => setValue('deliveryMethod', 'PICKUP')} />
                  <MethodOption icon={Truck} title="توصيل إلى العنوان" subtitle="الرسوم حسب المنطقة" active={deliveryMethod === 'DELIVERY'} disabled={!delivery?.deliveryEnabled || areas.length === 0} onSelect={() => setValue('deliveryMethod', 'DELIVERY')} />
                </div>
              )}

              {deliveryMethod === 'PICKUP' ? (
                <div className="space-y-4">
                  {delivery?.pickupLocation && (
                    <div className="flex gap-3 rounded-xl bg-ivory p-4 text-sm">
                      <MapPin className="mt-0.5 size-5 shrink-0 text-cocoa" />
                      <div className="space-y-1">
                        <p className="font-medium text-charcoal">موقع الاستلام</p>
                        <p className="text-charcoal/80">{delivery.pickupLocation}</p>
                        {delivery.pickupInstructions && <p className="text-xs text-muted-foreground">{delivery.pickupInstructions}</p>}
                        {delivery.estimatedPickupTime && <p className="text-xs text-muted-foreground">جاهزية الطلب: {delivery.estimatedPickupTime}</p>}
                      </div>
                    </div>
                  )}
                  <FormField label="وقت الاستلام">
                    <div className="flex flex-wrap gap-2">
                      {(['asap', 'scheduled'] as const).map((v) => (
                        <button key={v} type="button" onClick={() => setValue('pickupWhen', v)} className={cn('rounded-full border px-4 py-2 text-sm transition', pickupWhen === v ? 'border-cocoa bg-cocoa text-white' : 'border-border bg-white hover:border-taupe')}>
                          {v === 'asap' ? 'فور جاهزية الطلب' : 'تحديد وقت مفضل'}
                        </button>
                      ))}
                    </div>
                  </FormField>
                  {pickupWhen === 'scheduled' && (
                    <FormField label="الوقت المفضل للاستلام" htmlFor="pickupTime" error={errors.pickupTime?.message}>
                      <Input id="pickupTime" type="datetime-local" min={minPickupTime} className="max-w-xs" {...register('pickupTime')} aria-invalid={!!errors.pickupTime} />
                    </FormField>
                  )}
                </div>
              ) : (
                <div className="grid gap-4">
                  <FormField label="منطقة التوصيل" htmlFor="deliveryAreaId" required error={errors.deliveryAreaId?.message}>
                    <NativeSelect id="deliveryAreaId" {...register('deliveryAreaId')} aria-invalid={!!errors.deliveryAreaId}>
                      <option value="">اختر المنطقة...</option>
                      {areas.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} — {formatShekel(a.deliveryFee)}{a.estimatedDeliveryTime ? ` (${a.estimatedDeliveryTime})` : ''}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="عنوان التوصيل" htmlFor="deliveryAddress" required error={errors.deliveryAddress?.message}>
                    <Textarea id="deliveryAddress" placeholder="المدينة، الحي، الشارع، أقرب معلم" className="min-h-[80px]" {...register('deliveryAddress')} aria-invalid={!!errors.deliveryAddress} />
                  </FormField>
                  {delivery?.minOrderAmount && <p className="text-xs text-muted-foreground">الحد الأدنى لطلبات التوصيل: {formatShekel(delivery.minOrderAmount)}</p>}
                </div>
              )}

              <FormField label="ملاحظات إضافية" htmlFor="notes" error={errors.notes?.message}>
                <Textarea id="notes" placeholder="مثلاً: يرجى التواصل قبل التوصيل" {...register('notes')} />
              </FormField>
            </CardContent>
          </Card>
        </div>

        <Card className="lg:sticky lg:top-28">
          <CardHeader><CardTitle>ملخص الطلب</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <ul className="space-y-3">
              {cart.items.map((item) => {
                const q = quote.data?.items.find((x) => x.productId === item.productId && x.variantId === item.variantId && x.quantity === item.quantity);
                return (
                  <li key={item.key} className="flex gap-3">
                    <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-ivory">
                      <ProductImage src={item.image} alt={item.name} className="size-full" />
                      <span className="absolute -left-1 -top-1 flex size-5 items-center justify-center rounded-full bg-charcoal text-[10px] text-white">{item.quantity}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.quantity} × {formatShekel(q?.unitPrice ?? item.unitPrice)}
                        {item.variantLabel && ` · ${item.variantLabel}`}
                      </p>
                      {item.customization.length > 0 && <p className="truncate text-xs text-muted-foreground">{item.customization.map((c) => `${c.label}: ${c.value}`).join('، ')}</p>}
                    </div>
                    <span className="font-medium">{q ? formatShekel(q.subtotal) : '...'}</span>
                  </li>
                );
              })}
            </ul>
            <Separator />
            {quote.isError ? (
              <p className="flex items-start gap-1.5 rounded-lg bg-red-50 p-2.5 text-xs text-destructive"><AlertCircle className="size-4 shrink-0" />{errorMessage(quote.error)}</p>
            ) : (
              <dl className="space-y-2.5">
                <Row label="إجمالي الكمية" value={`${quote.data?.totalQuantity ?? cart.totalQuantity} قطعة`} />
                <Row label="إجمالي المنتجات" value={quote.data ? formatShekel(quote.data.subtotal) : '—'} loading={quote.isFetching} />
                <Row label="رسوم التوصيل" value={deliveryMethod === 'PICKUP' ? 'مجاناً (استلام)' : quote.data ? formatShekel(quote.data.deliveryFee) : 'اختر المنطقة'} loading={quote.isFetching} />
                <Separator />
                <div className="flex items-center justify-between text-base">
                  <dt className="font-semibold">الإجمالي النهائي</dt>
                  <dd className="text-xl font-bold text-cocoa">{quote.data ? formatShekel(quote.data.total) : '—'}</dd>
                </div>
              </dl>
            )}
            <p className="rounded-xl bg-ivory p-3 text-xs leading-6 text-muted-foreground">الدفع عند الاستلام. بعد تأكيد الطلب رح يتم حفظه عنا، وبتقدر ترسل التفاصيل عبر واتساب لتأكيده بشكل أسرع.</p>
            {submitError && <p className="flex items-start gap-1.5 rounded-lg bg-red-50 p-2.5 text-xs text-destructive"><AlertCircle className="size-4 shrink-0" />{submitError}</p>}
            <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={submitting || !!storeClosed || cartProblems || quote.isError}>
              {submitting ? 'جاري إرسال الطلب...' : 'تأكيد الطلب'}
            </Button>
            {cartProblems && <p className="text-center text-xs text-destructive">بعض المنتجات غير متوفرة بالكمية المطلوبة. <Link to="/cart" className="underline">عدّل السلة</Link></p>}
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

function Row({ label, value, loading }: { label: string; value: string; loading?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('font-medium transition-opacity', loading && 'opacity-50')}>{value}</dd>
    </div>
  );
}

function MethodOption({ icon: Icon, title, subtitle, active, disabled, onSelect }: { icon: typeof Store; title: string; subtitle: string; active: boolean; disabled?: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-3 rounded-2xl border-2 p-4 text-right transition',
        active ? 'border-cocoa bg-beige/30' : 'border-border bg-white hover:border-taupe/60',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span className={cn('flex size-11 items-center justify-center rounded-full', active ? 'bg-cocoa text-white' : 'bg-beige/60 text-cocoa')}>
        <Icon className="size-5" />
      </span>
      <span>
        <span className="block font-semibold text-charcoal">{title}</span>
        <span className="block text-xs text-muted-foreground">{disabled ? 'غير متاح حالياً' : subtitle}</span>
      </span>
    </button>
  );
}
