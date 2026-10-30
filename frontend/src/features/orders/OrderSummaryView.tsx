import { Clock, MapPin, Store, Truck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { ProductImage } from '@/components/store/ProductBits';
import { formatShekel } from '@/lib/money';
import { formatDateTime } from '@/lib/utils';
import type { CustomerOrder } from '@/types';

/** Read-only summary of a saved order, shared by the confirmation and tracking pages. */
export function OrderSummaryView({ order }: { order: CustomerOrder }) {
  return (
    <div className="grid gap-5 md:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>المنتجات</CardTitle>
          <Badge variant="neutral">{order.statusLabel}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {order.items.map((item) => (
            <div key={item.id} className="flex gap-3 text-sm">
              <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-ivory">
                <ProductImage src={item.image} alt={item.productName} className="size-full" />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="font-medium">{item.productName}</p>
                {item.variant && <p className="text-xs text-muted-foreground">{item.variant.name}: {item.variant.value}</p>}
                {item.customization.map((c) => <p key={c.label} className="text-xs text-muted-foreground">{c.label}: {c.value}</p>)}
                <p className="text-xs text-muted-foreground">{item.quantity} × {formatShekel(item.unitPrice)}</p>
              </div>
              <span className="font-semibold">{formatShekel(item.subtotal)}</span>
            </div>
          ))}
          <Separator />
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">إجمالي الكمية</dt><dd>{order.totalQuantity} قطعة</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">إجمالي المنتجات</dt><dd>{formatShekel(order.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">رسوم التوصيل</dt><dd>{order.deliveryMethod === 'PICKUP' ? 'مجاناً' : formatShekel(order.deliveryFee)}</dd></div>
            <div className="flex justify-between pt-1 text-base"><dt className="font-semibold">الإجمالي النهائي</dt><dd className="text-lg font-bold text-cocoa">{formatShekel(order.total)}</dd></div>
          </dl>
        </CardContent>
      </Card>

      <div className="space-y-5">
        <Card>
          <CardHeader><CardTitle className="text-base">بيانات الطلب</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">رقم الطلب: </span><span className="ltr-nums font-semibold">{order.orderNumber}</span></p>
            <p><span className="text-muted-foreground">التاريخ: </span>{formatDateTime(order.createdAt)}</p>
            <p><span className="text-muted-foreground">الاسم: </span>{order.customerName}</p>
            <p><span className="text-muted-foreground">الهاتف: </span><span className="ltr-nums">{order.customerPhone}</span></p>
            {order.recipientName && <p><span className="text-muted-foreground">المستلم: </span>{order.recipientName} {order.recipientPhone && <span className="ltr-nums">({order.recipientPhone})</span>}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base">{order.deliveryMethod === 'PICKUP' ? <Store className="size-4" /> : <Truck className="size-4" />}{order.deliveryMethod === 'PICKUP' ? 'استلام من الموقع' : 'توصيل'}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {order.deliveryMethod === 'DELIVERY' ? (
              <>
                <p className="flex gap-1.5"><MapPin className="mt-0.5 size-4 shrink-0 text-cocoa" />{order.deliveryArea} — {order.deliveryAddress}</p>
              </>
            ) : (
              <>
                {order.pickupLocation && <p className="flex gap-1.5"><MapPin className="mt-0.5 size-4 shrink-0 text-cocoa" />{order.pickupLocation}</p>}
                <p className="flex gap-1.5"><Clock className="mt-0.5 size-4 shrink-0 text-cocoa" />{order.pickupTime ? formatDateTime(order.pickupTime) : 'فور جاهزية الطلب'}</p>
              </>
            )}
            {order.customerNotes && <p className="rounded-lg bg-ivory p-2.5 text-xs">ملاحظات: {order.customerNotes}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
