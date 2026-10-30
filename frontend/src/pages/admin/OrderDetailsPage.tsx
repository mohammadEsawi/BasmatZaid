import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Clock, Copy, MapPin, MessageSquareText, Store, Truck, User } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { NativeSelect, Textarea } from '@/components/ui/input';
import { Separator, Skeleton } from '@/components/ui/misc';
import { ConfirmDialog, ErrorBox, ORDER_STATUS, OrderStatusBadge, PAYMENT_STATUS } from '@/components/admin/AdminUi';
import { ProductImage } from '@/components/store/ProductBits';
import { WhatsAppIcon } from '@/components/store/SocialIcons';
import { adminApi } from '@/services/admin';
import { errorMessage } from '@/services/api';
import { formatShekel } from '@/lib/money';
import { formatDateTime } from '@/lib/utils';
import type { AdminOrder, OrderStatus, PaymentStatus } from '@/types';

const ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: 'تأكيد الطلب',
  PREPARING: 'بدء التجهيز',
  READY: 'جاهز',
  OUT_FOR_DELIVERY: 'خرج للتوصيل',
  COMPLETED: 'مكتمل',
  CANCELLED: 'إلغاء الطلب',
};

export default function OrderDetailsPage() {
  const { id = '' } = useParams();
  const query = useQuery({ queryKey: ['admin', 'order', id], queryFn: () => adminApi.order(id) });
  if (query.isLoading) return <Skeleton className="h-[70vh]" />;
  if (query.isError || !query.data) return <ErrorBox error={query.error} onRetry={() => query.refetch()} />;
  return <OrderView order={query.data} />;
}

function OrderView({ order }: { order: AdminOrder }) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<OrderStatus | null>(null);
  const [note, setNote] = useState('');
  const [adminNotes, setAdminNotes] = useState(order.adminNotes ?? '');

  const onUpdated = (r: { data: AdminOrder; message: string }) => {
    toast.success(r.message);
    queryClient.setQueryData(['admin', 'order', order.id], r.data);
    queryClient.invalidateQueries({ queryKey: ['admin'], predicate: (q) => q.queryKey[1] !== 'order' });
  };

  const statusMutation = useMutation({
    mutationFn: ({ status, note }: { status: OrderStatus; note?: string }) => adminApi.setOrderStatus(order.id, status, note),
    onSuccess: (r) => {
      onUpdated(r);
      setPending(null);
      setNote('');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const notesMutation = useMutation({ mutationFn: () => adminApi.setOrderNotes(order.id, adminNotes), onSuccess: onUpdated, onError: (e) => toast.error(errorMessage(e)) });
  const paymentMutation = useMutation({ mutationFn: (s: PaymentStatus) => adminApi.setOrderPayment(order.id, s), onSuccess: onUpdated, onError: (e) => toast.error(errorMessage(e)) });

  const copyMessage = () => navigator.clipboard?.writeText(order.whatsapp.message).then(() => toast.success('تم نسخ نص الرسالة'));

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <Link to="/admin/orders" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-cocoa"><ArrowRight className="size-4" /> كل الطلبات</Link>
          <h1 className="flex flex-wrap items-center gap-3 font-display text-2xl font-semibold md:text-3xl">
            <span className="ltr-nums">{order.orderNumber}</span>
            <OrderStatusBadge status={order.status} />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{formatDateTime(order.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {order.whatsapp.toCustomerUrl && (
            <Button asChild variant="whatsapp">
              <a href={order.whatsapp.toCustomerUrl} target="_blank" rel="noopener noreferrer"><WhatsAppIcon className="size-4" /> إرسال تفاصيل الطلب عبر واتساب</a>
            </Button>
          )}
          {order.whatsapp.toBusinessUrl && (
            <Button asChild variant="outline">
              <a href={order.whatsapp.toBusinessUrl} target="_blank" rel="noopener noreferrer"><WhatsAppIcon className="size-4" /> لرقم المتجر</a>
            </Button>
          )}
          <Button variant="outline" onClick={copyMessage}><Copy /> نسخ الرسالة</Button>
        </div>
      </div>

      {order.allowedTransitions.length > 0 && (
        <Card className="mb-6">
          <CardContent className="flex flex-wrap items-center gap-2 pt-5">
            <span className="me-2 text-sm font-medium">تحديث الحالة:</span>
            {order.allowedTransitions.map((s) => (
              <Button key={s} size="sm" variant={s === 'CANCELLED' ? 'destructive' : s === order.allowedTransitions[0] ? 'default' : 'outline'} onClick={() => setPending(s)}>
                {order.deliveryMethod === 'PICKUP' && s === 'COMPLETED' ? 'تم الاستلام' : order.deliveryMethod === 'DELIVERY' && s === 'COMPLETED' ? 'تم التوصيل' : ACTION_LABEL[s]}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>المنتجات ({order.items.length})</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {order.items.map((item) => (
                <div key={item.id} className="flex gap-3">
                  <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-ivory"><ProductImage src={item.image} alt={item.productName} className="size-full" /></div>
                  <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                    <p className="font-medium">{item.productId ? <Link to={`/admin/products/${item.productId}`} className="hover:text-cocoa">{item.productName}</Link> : item.productName}</p>
                    {item.productSku && <p className="text-xs text-muted-foreground">SKU: {item.productSku}</p>}
                    {item.variant && <p className="text-xs text-muted-foreground">{item.variant.name}: {item.variant.value}</p>}
                    {item.customization.length > 0 && (
                      <div className="mt-1 rounded-lg bg-beige/30 p-2 text-xs">
                        {item.customization.map((c) => <p key={c.label}><span className="text-muted-foreground">{c.label}:</span> {c.value}</p>)}
                      </div>
                    )}
                  </div>
                  <div className="text-left text-sm">
                    <p className="text-muted-foreground">{item.quantity} × {formatShekel(item.unitPrice)}</p>
                    <p className="font-semibold">{formatShekel(item.subtotal)}</p>
                  </div>
                </div>
              ))}
              <Separator />
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">إجمالي الكمية</dt><dd>{order.totalQuantity} قطعة</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">إجمالي المنتجات</dt><dd>{formatShekel(order.subtotal)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">رسوم التوصيل</dt><dd>{formatShekel(order.deliveryFee)}</dd></div>
                <div className="flex justify-between text-base"><dt className="font-semibold">الإجمالي النهائي</dt><dd className="text-lg font-bold text-cocoa">{formatShekel(order.total)}</dd></div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>سجل الحالات</CardTitle></CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-r-2 border-beige pr-5">
                {order.statusHistory.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="absolute -right-[27px] top-1 size-3 rounded-full border-2 border-white bg-cocoa" />
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      {h.previousLabel && <><span className="text-muted-foreground">{h.previousLabel}</span><span>←</span></>}
                      <Badge variant={ORDER_STATUS[h.newStatus].variant}>{h.newLabel}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(h.createdAt)} · {h.admin?.name ?? 'الزبون (الموقع)'}</p>
                    {h.note && <p className="mt-1 text-xs">{h.note}</p>}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>حركات المخزون</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-xs text-muted-foreground">حالة المخزون للطلب: {order.inventoryStatus === 'DEDUCTED' ? 'تم الخصم من المخزون' : order.inventoryStatus === 'RESTORED' ? 'تم إرجاع الكميات للمخزون' : 'لم يتم الخصم'}</p>
              {order.inventoryMovements.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ivory/60 px-3 py-2">
                  <span>{m.product?.name}{m.variant && ` (${m.variant.value})`}</span>
                  <span className={m.quantityChange > 0 ? 'ltr-nums font-semibold text-emerald-700' : 'ltr-nums font-semibold text-destructive'}>{m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}</span>
                  <span className="text-xs text-muted-foreground">{m.previousQuantity} ← {m.newQuantity} · {formatDateTime(m.createdAt)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><User className="size-4" /> الزبون</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <p className="font-medium">{order.customerName}</p>
              <p className="ltr-nums text-muted-foreground">{order.customerPhone}</p>
              {(order.recipientName || order.recipientPhone) && (
                <p className="rounded-lg bg-ivory p-2 text-xs">المستلم: {order.recipientName} {order.recipientPhone && <span className="ltr-nums">({order.recipientPhone})</span>}</p>
              )}
              <Link to={`/admin/customers/${order.customer.id}`} className="inline-block pt-1 text-xs font-medium text-cocoa hover:underline">ملف الزبون ({order.customer._count.orders} طلبات)</Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base">{order.deliveryMethod === 'PICKUP' ? <Store className="size-4" /> : <Truck className="size-4" />}{order.deliveryMethod === 'PICKUP' ? 'استلام من الموقع' : 'توصيل'}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {order.deliveryMethod === 'DELIVERY' ? (
                <>
                  <p><span className="text-muted-foreground">المنطقة: </span>{order.deliveryArea}</p>
                  <p className="flex gap-1.5"><MapPin className="mt-0.5 size-4 shrink-0 text-cocoa" />{order.deliveryAddress}</p>
                </>
              ) : (
                <>
                  {order.pickupLocation && <p className="flex gap-1.5"><MapPin className="mt-0.5 size-4 shrink-0 text-cocoa" />{order.pickupLocation}</p>}
                  <p className="flex gap-1.5"><Clock className="mt-0.5 size-4 shrink-0 text-cocoa" />{order.pickupTime ? formatDateTime(order.pickupTime) : 'فور جاهزية الطلب'}</p>
                </>
              )}
              {order.customerNotes && <p className="flex gap-1.5 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900"><MessageSquareText className="size-4 shrink-0" />{order.customerNotes}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">الدفع</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p><span className="text-muted-foreground">طريقة الدفع: </span>{order.paymentMethod === 'CASH' ? 'نقداً عند الاستلام' : 'تحويل بنكي'}</p>
              <FormField label="حالة الدفع" htmlFor="payment">
                <NativeSelect id="payment" value={order.paymentStatus} disabled={paymentMutation.isPending} onChange={(e) => paymentMutation.mutate(e.target.value as PaymentStatus)}>
                  {(Object.keys(PAYMENT_STATUS) as PaymentStatus[]).map((s) => <option key={s} value={s}>{PAYMENT_STATUS[s].label}</option>)}
                </NativeSelect>
              </FormField>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">ملاحظات داخلية</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} placeholder="ملاحظات للفريق فقط، لا تظهر للزبون" />
              <Button size="sm" variant="outline" loading={notesMutation.isPending} disabled={adminNotes === (order.adminNotes ?? '')} onClick={() => notesMutation.mutate()}>حفظ الملاحظات</Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending === 'CANCELLED' ? 'إلغاء الطلب؟' : `تغيير الحالة إلى "${pending ? ORDER_STATUS[pending].label : ''}"؟`}
        description={pending === 'CANCELLED' ? (order.inventoryStatus === 'DEDUCTED' ? 'سيتم إرجاع كميات المنتجات إلى المخزون. لا يمكن التراجع عن الإلغاء.' : 'لا يمكن التراجع عن الإلغاء.') : pending === 'COMPLETED' ? 'لا يمكن تعديل الطلب بعد إكماله.' : undefined}
        confirmLabel={pending === 'CANCELLED' ? 'تأكيد الإلغاء' : 'تأكيد'}
        destructive={pending === 'CANCELLED'}
        loading={statusMutation.isPending}
        onConfirm={() => pending && statusMutation.mutate({ status: pending, note })}
      >
        <FormField label={pending === 'CANCELLED' ? 'سبب الإلغاء' : 'ملاحظة (اختياري)'} htmlFor="status-note" required={pending === 'CANCELLED' && order.status === 'OUT_FOR_DELIVERY'}>
          <Textarea id="status-note" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[72px]" />
        </FormField>
      </ConfirmDialog>
    </>
  );
}
