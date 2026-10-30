import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Input, NativeSelect } from '@/components/ui/input';
import { Skeleton, TableWrap, Td, Th } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { ErrorBox, ORDER_STATUS, OrderStatusBadge, PAYMENT_STATUS, PageHeader, Pagination, SearchInput } from '@/components/admin/AdminUi';
import { useDebounced } from '@/hooks/useDebounced';
import { adminApi } from '@/services/admin';
import { formatShekel } from '@/lib/money';
import { cn, formatDateTime } from '@/lib/utils';
import type { OrderStatus } from '@/types';

const STATUSES = Object.keys(ORDER_STATUS) as OrderStatus[];

export default function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as OrderStatus | null) ?? '';
  const [search, setSearch] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);

  const query = useQuery({
    queryKey: ['admin', 'orders', { status, debounced, deliveryMethod, from, to, sort, page }],
    queryFn: () => adminApi.orders({ status, search: debounced, deliveryMethod, from, to, sort, page, pageSize: 20 }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  const setStatus = (s: string) => {
    setPage(1);
    setParams(s ? { status: s } : {});
  };
  const counts = query.data?.statusCounts ?? {};
  const allCount = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <>
      <PageHeader title="الطلبات" description="كل الطلبات محفوظة هنا حتى لو لم يرسلها الزبون عبر واتساب" />

      <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        <StatusTab active={!status} label="الكل" count={allCount} onClick={() => setStatus('')} />
        {STATUSES.map((s) => <StatusTab key={s} active={status === s} label={ORDER_STATUS[s].label} count={counts[s] ?? 0} onClick={() => setStatus(s)} />)}
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="رقم الطلب، اسم أو هاتف الزبون" className="lg:col-span-2" />
        <NativeSelect value={deliveryMethod} onChange={(e) => { setDeliveryMethod(e.target.value); setPage(1); }} className="h-10">
          <option value="">كل طرق الاستلام</option>
          <option value="PICKUP">استلام من الموقع</option>
          <option value="DELIVERY">توصيل</option>
        </NativeSelect>
        <div className="flex items-center gap-1.5">
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="h-10" aria-label="من تاريخ" />
          <span className="text-xs text-muted-foreground">إلى</span>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="h-10" aria-label="إلى تاريخ" />
        </div>
        <NativeSelect value={sort} onChange={(e) => setSort(e.target.value)} className="h-10">
          <option value="newest">الأحدث</option>
          <option value="oldest">الأقدم</option>
          <option value="total_desc">الإجمالي: الأعلى</option>
          <option value="total_asc">الإجمالي: الأقل</option>
        </NativeSelect>
      </div>

      {query.isError ? (
        <ErrorBox error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <TableWrap className={cn(query.isPlaceholderData && 'opacity-60')}>
          <table className="w-full min-w-[900px]">
            <thead><tr><Th>رقم الطلب</Th><Th>التاريخ</Th><Th>الزبون</Th><Th>الاستلام</Th><Th>القطع</Th><Th>الإجمالي</Th><Th>الدفع</Th><Th>الحالة</Th></tr></thead>
            <tbody>
              {query.isLoading && <tr><Td colSpan={8}><Skeleton className="h-40" /></Td></tr>}
              {query.data?.items.map((o) => (
                <tr key={o.id} className="hover:bg-ivory/50">
                  <Td><Link to={`/admin/orders/${o.id}`} className="ltr-nums font-semibold text-cocoa hover:underline">{o.orderNumber}</Link></Td>
                  <Td className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(o.createdAt)}</Td>
                  <Td>
                    <p className="font-medium">{o.customerName}</p>
                    <p className="ltr-nums text-xs text-muted-foreground">{o.customerPhone}</p>
                  </Td>
                  <Td className="text-sm">{o.deliveryMethod === 'PICKUP' ? 'استلام' : <>توصيل<span className="block text-xs text-muted-foreground">{o.deliveryArea}</span></>}</Td>
                  <Td>{o.totalQuantity}</Td>
                  <Td className="font-semibold">{formatShekel(o.total)}</Td>
                  <Td><Badge variant={PAYMENT_STATUS[o.paymentStatus].variant}>{PAYMENT_STATUS[o.paymentStatus].label}</Badge></Td>
                  <Td><OrderStatusBadge status={o.status} /></Td>
                </tr>
              ))}
              {query.data?.items.length === 0 && <tr><Td colSpan={8} className="py-12 text-center text-muted-foreground">لا توجد طلبات مطابقة</Td></tr>}
            </tbody>
          </table>
        </TableWrap>
      )}
      {query.data && <Pagination page={page} totalPages={query.data.pagination.totalPages} onChange={setPage} />}
    </>
  );
}

function StatusTab({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn('flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition', active ? 'border-cocoa bg-cocoa text-white' : 'border-border bg-white hover:border-taupe')}>
      {label}
      <span className={cn('rounded-full px-1.5 text-xs', active ? 'bg-white/20' : 'bg-muted')}>{count}</span>
    </button>
  );
}
