import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, Coins, Package, PackageX, ShoppingCart, Sparkles, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton, TableWrap, Td, Th } from '@/components/ui/misc';
import { ErrorBox, OrderStatusBadge, PageHeader, StatCard } from '@/components/admin/AdminUi';
import { adminApi } from '@/services/admin';
import { agorotToString, formatShekel, toAgorot } from '@/lib/money';
import { formatDateTime } from '@/lib/utils';
import type { DashboardStats } from '@/types';

export default function DashboardPage() {
  const stats = useQuery({ queryKey: ['admin', 'stats'], queryFn: adminApi.stats, refetchInterval: 60_000 });
  const recent = useQuery({ queryKey: ['admin', 'recent-orders'], queryFn: adminApi.recentOrders, refetchInterval: 60_000 });

  if (stats.isError) return <ErrorBox error={stats.error} onRetry={() => stats.refetch()} />;
  const s = stats.data;

  return (
    <>
      <PageHeader title="لوحة التحكم" description="نظرة عامة على المتجر والطلبات" />
      {!s ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="إجمالي المبيعات" value={formatShekel(s.sales.total)} icon={Coins} hint={`المكتملة: ${formatShekel(s.sales.completed)}`} />
            <StatCard label="إجمالي الطلبات" value={s.orders.total} icon={ShoppingCart} />
            <StatCard label="طلبات جديدة" value={s.orders.new} icon={Sparkles} tone="info" />
            <StatCard label="طلبات قيد المعالجة" value={s.orders.pending} icon={Clock} tone="warning" hint="لم تكتمل بعد" />
            <StatCard label="طلبات مؤكدة" value={s.orders.confirmed} icon={CheckCircle2} tone="info" />
            <StatCard label="طلبات مكتملة" value={s.orders.completed} icon={CheckCircle2} tone="success" />
            <StatCard label="طلبات ملغية" value={s.orders.cancelled} icon={XCircle} tone="danger" />
            <StatCard label="المنتجات" value={s.products.total} icon={Package} hint={`${s.products.active} نشط`} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link to="/admin/inventory?filter=low" className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 transition hover:bg-amber-50">
              <AlertTriangle className="size-6 text-amber-600" />
              <div><p className="font-semibold text-amber-900">{s.products.lowStock} منتج مخزونه منخفض</p><p className="text-xs text-amber-800/80">اضغط لعرض المخزون</p></div>
            </Link>
            <Link to="/admin/inventory?filter=out" className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50/60 p-4 transition hover:bg-red-50">
              <PackageX className="size-6 text-red-600" />
              <div><p className="font-semibold text-red-900">{s.products.outOfStock} منتج نفد من المخزون</p><p className="text-xs text-red-800/80">اضغط لعرض المخزون</p></div>
            </Link>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <SalesChart daily={s.sales.daily} />
            <Card>
              <CardHeader><CardTitle className="text-base">الأكثر مبيعاً</CardTitle></CardHeader>
              <CardContent>
                {s.bestSellers.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">لا توجد مبيعات بعد</p>
                ) : (
                  <ol className="space-y-3">
                    {s.bestSellers.map((b, i) => (
                      <li key={`${b.productId}-${b.name}`} className="flex items-center gap-3 text-sm">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-beige/70 text-xs font-semibold text-cocoa">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate font-medium">{b.name}</span>
                        <span className="text-muted-foreground">{b.quantity} قطعة</span>
                        <span className="w-20 text-left font-medium">{formatShekel(b.revenue)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">أحدث الطلبات</h2>
          <Link to="/admin/orders" className="text-sm font-medium text-cocoa hover:underline">كل الطلبات</Link>
        </div>
        <TableWrap>
          <table className="w-full min-w-[640px]">
            <thead><tr><Th>رقم الطلب</Th><Th>الزبون</Th><Th>الاستلام</Th><Th>الإجمالي</Th><Th>الحالة</Th><Th>التاريخ</Th></tr></thead>
            <tbody>
              {recent.data?.map((o) => (
                <tr key={o.id} className="hover:bg-ivory/60">
                  <Td><Link to={`/admin/orders/${o.id}`} className="ltr-nums font-semibold text-cocoa hover:underline">{o.orderNumber}</Link></Td>
                  <Td>{o.customerName}</Td>
                  <Td>{o.deliveryMethod === 'PICKUP' ? 'استلام' : 'توصيل'}</Td>
                  <Td className="font-medium">{formatShekel(o.total)}</Td>
                  <Td><OrderStatusBadge status={o.status} /></Td>
                  <Td className="text-xs text-muted-foreground">{formatDateTime(o.createdAt)}</Td>
                </tr>
              ))}
              {recent.data?.length === 0 && <tr><Td colSpan={6} className="py-10 text-center text-muted-foreground">لا توجد طلبات بعد</Td></tr>}
            </tbody>
          </table>
        </TableWrap>
      </div>
    </>
  );
}

function SalesChart({ daily }: { daily: DashboardStats['sales']['daily'] }) {
  const max = Math.max(...daily.map((d) => toAgorot(d.total)), 1);
  const total = daily.reduce((sum, d) => sum + toAgorot(d.total), 0);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">المبيعات آخر 14 يوم</CardTitle>
        <span className="text-sm font-semibold text-cocoa">{formatShekel(agorotToString(total))}</span>
      </CardHeader>
      <CardContent>
        <div className="flex h-48 items-end gap-1.5" dir="ltr">
          {daily.map((d) => {
            const h = (toAgorot(d.total) / max) * 100;
            return (
              <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end">
                <div className="w-full rounded-t-md bg-taupe/70 transition group-hover:bg-cocoa" style={{ height: `${Math.max(h, d.orders ? 4 : 1.5)}%` }} />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-charcoal px-2 py-1 text-[11px] text-white group-hover:block" dir="rtl">
                  {d.day.slice(5)} · {formatShekel(d.total)} · {d.orders} طلب
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground" dir="ltr">
          <span>{daily[0]?.day.slice(5)}</span>
          <span>{daily[daily.length - 1]?.day.slice(5)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
