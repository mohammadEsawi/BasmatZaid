import { Link, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { EmptyState } from '@/components/store/ProductBits';
import { WhatsAppIcon } from '@/components/store/SocialIcons';
import { OrderSummaryView } from '@/features/orders/OrderSummaryView';
import { usePublicSettings } from '@/hooks/useStore';
import { errorMessage } from '@/services/api';
import { storefront } from '@/services/storefront';
import { formatShekel } from '@/lib/money';
import type { CustomerOrder } from '@/types';

function cachedOrder(orderNumber: string): CustomerOrder | undefined {
  try {
    const raw = sessionStorage.getItem(`bz_order_${orderNumber}`);
    return raw ? (JSON.parse(raw) as CustomerOrder) : undefined;
  } catch {
    return undefined;
  }
}

export default function OrderConfirmationPage() {
  const { orderNumber = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { data: settings } = usePublicSettings();

  // The order is always re-read from the backend; the cached copy only avoids a blank flash.
  const query = useQuery({
    queryKey: ['order', orderNumber, token],
    queryFn: () => storefront.trackOrder(orderNumber, { token }),
    enabled: !!token,
    initialData: () => cachedOrder(orderNumber),
    initialDataUpdatedAt: 0,
    retry: 1,
  });

  if (!token) {
    return (
      <div className="container max-w-2xl py-16">
        <EmptyState title="رابط غير صالح" description="يمكنك تتبع طلبك باستخدام رقم الطلب ورقم الهاتف">
          <Button asChild><Link to="/track">تتبع الطلب</Link></Button>
        </EmptyState>
      </div>
    );
  }

  if (query.isLoading) return <div className="container max-w-4xl space-y-4 py-12"><Skeleton className="h-40" /><Skeleton className="h-72" /></div>;
  if (query.isError || !query.data) {
    return (
      <div className="container max-w-2xl py-16">
        <EmptyState title="تعذر عرض الطلب" description={errorMessage(query.error)}>
          <Button asChild><Link to="/track">تتبع الطلب</Link></Button>
        </EmptyState>
      </div>
    );
  }

  const order = query.data;
  const businessName = settings?.business.nameAr ?? 'بصمة زيد';

  return (
    <div className="container max-w-4xl py-10 md:py-14">
      <div className="mb-8 rounded-3xl border border-emerald-200/70 bg-white p-6 text-center shadow-soft md:p-10">
        <CheckCircle2 className="mx-auto mb-4 size-16 text-emerald-600" strokeWidth={1.5} />
        <h1 className="font-display text-3xl font-bold text-charcoal">تم استلام طلبك بنجاح!</h1>
        <p className="mt-2 text-muted-foreground">شكراً لطلبك من {businessName} 🌸</p>
        <div className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full bg-ivory px-5 py-2.5">
          <span className="text-sm text-muted-foreground">رقم الطلب:</span>
          <span className="ltr-nums font-bold tracking-wide text-charcoal">{order.orderNumber}</span>
          <button
            onClick={() => navigator.clipboard?.writeText(order.orderNumber).then(() => toast.success('تم نسخ رقم الطلب'))}
            className="rounded-full p-1 text-muted-foreground hover:bg-beige hover:text-charcoal"
            aria-label="نسخ رقم الطلب"
          >
            <Copy className="size-4" />
          </button>
        </div>
        <p className="mt-4 text-2xl font-bold text-cocoa">الإجمالي: {formatShekel(order.total)}</p>
        <p className="mt-1 text-sm text-muted-foreground">{order.deliveryMethod === 'PICKUP' ? 'استلام من الموقع' : `توصيل إلى ${order.deliveryArea}`}</p>

        <div className="mx-auto mt-7 max-w-md space-y-3">
          {order.whatsappUrl ? (
            <>
              <Button asChild variant="whatsapp" size="lg" className="w-full text-base">
                <a href={order.whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <WhatsAppIcon className="size-5" /> إرسال الطلب عبر واتساب
                </a>
              </Button>
              <p className="text-xs leading-6 text-muted-foreground">طلبك محفوظ عنا. إرسال التفاصيل عبر واتساب بيساعدنا نأكد طلبك بشكل أسرع.</p>
            </>
          ) : (
            <p className="rounded-xl bg-ivory p-3 text-sm text-muted-foreground">طلبك محفوظ عنا ورح نتواصل معك قريباً على رقم هاتفك.</p>
          )}
        </div>
      </div>

      <OrderSummaryView order={order} />

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild variant="outline"><Link to="/products">متابعة التسوق</Link></Button>
        <Button asChild variant="ghost"><Link to="/track">تتبع طلب آخر</Link></Button>
      </div>
    </div>
  );
}
