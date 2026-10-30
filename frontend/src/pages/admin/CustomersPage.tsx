import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Coins, ShoppingCart, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect, Textarea } from '@/components/ui/input';
import { Skeleton, TableWrap, Td, Th } from '@/components/ui/misc';
import { ErrorBox, OrderStatusBadge, PageHeader, Pagination, SearchInput, StatCard } from '@/components/admin/AdminUi';
import { WhatsAppIcon } from '@/components/store/SocialIcons';
import { useDebounced } from '@/hooks/useDebounced';
import { adminApi } from '@/services/admin';
import { errorMessage } from '@/services/api';
import { formatShekel } from '@/lib/money';
import { cn, formatDate, formatDateTime } from '@/lib/utils';
import type { CustomerDetails } from '@/types';

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);
  const query = useQuery({ queryKey: ['admin', 'customers', { debounced, sort, page }], queryFn: () => adminApi.customers({ search: debounced, sort, page, pageSize: 20 }), placeholderData: keepPreviousData });

  return (
    <>
      <PageHeader title="الزبائن" description="يتم التعرف على الزبائن من خلال رقم الهاتف" />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="بحث بالاسم أو رقم الهاتف" className="sm:w-80" />
        <NativeSelect value={sort} onChange={(e) => setSort(e.target.value)} className="h-10 sm:w-48">
          <option value="recent">آخر نشاط</option>
          <option value="newest">الأحدث تسجيلاً</option>
          <option value="name">الاسم</option>
        </NativeSelect>
      </div>
      {query.isError ? (
        <ErrorBox error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <TableWrap className={cn(query.isPlaceholderData && 'opacity-60')}>
          <table className="w-full min-w-[720px]">
            <thead><tr><Th>الزبون</Th><Th>الهاتف</Th><Th>عدد الطلبات</Th><Th>إجمالي المشتريات</Th><Th>آخر طلب</Th><Th>ملاحظات</Th></tr></thead>
            <tbody>
              {query.isLoading && <tr><Td colSpan={6}><Skeleton className="h-32" /></Td></tr>}
              {query.data?.items.map((c) => (
                <tr key={c.id} className="hover:bg-ivory/50">
                  <Td><Link to={`/admin/customers/${c.id}`} className="font-medium hover:text-cocoa">{c.name}</Link></Td>
                  <Td className="ltr-nums">{c.phone}</Td>
                  <Td>{c.ordersCount}</Td>
                  <Td className="font-medium">{formatShekel(c.totalSpent)}</Td>
                  <Td className="text-xs text-muted-foreground">{c.lastOrderAt ? formatDate(c.lastOrderAt) : '—'}</Td>
                  <Td className="max-w-48 truncate text-xs text-muted-foreground">{c.notes ?? '—'}</Td>
                </tr>
              ))}
              {query.data?.items.length === 0 && <tr><Td colSpan={6} className="py-12 text-center text-muted-foreground">لا يوجد زبائن بعد</Td></tr>}
            </tbody>
          </table>
        </TableWrap>
      )}
      {query.data && <Pagination page={page} totalPages={query.data.pagination.totalPages} onChange={setPage} />}
    </>
  );
}

export function CustomerDetailsPage() {
  const { id = '' } = useParams();
  const query = useQuery({ queryKey: ['admin', 'customer', id], queryFn: () => adminApi.customer(id) });
  if (query.isLoading) return <Skeleton className="h-96" />;
  if (query.isError || !query.data) return <ErrorBox error={query.error} onRetry={() => query.refetch()} />;
  return <CustomerView customer={query.data} />;
}

function CustomerView({ customer }: { customer: CustomerDetails }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [notes, setNotes] = useState(customer.notes ?? '');
  const orders = useQuery({ queryKey: ['admin', 'customer-orders', customer.id, page], queryFn: () => adminApi.customerOrders(customer.id, { page, pageSize: 10 }), placeholderData: keepPreviousData });
  const save = useMutation({
    mutationFn: () => adminApi.setCustomerNotes(customer.id, notes),
    onSuccess: (r) => {
      toast.success(r.message);
      queryClient.invalidateQueries({ queryKey: ['admin', 'customer', customer.id] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <Link to="/admin/customers" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-cocoa"><ArrowRight className="size-4" /> كل الزبائن</Link>
      <PageHeader
        title={customer.name}
        description={`زبون منذ ${formatDate(customer.createdAt)}`}
        actions={
          <Button asChild variant="whatsapp">
            <a href={customer.whatsappUrl} target="_blank" rel="noopener noreferrer"><WhatsAppIcon className="size-4" /> <span className="ltr-nums">{customer.phone}</span></a>
          </Button>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="عدد الطلبات" value={customer.ordersCount} icon={ShoppingCart} />
        <StatCard label="إجمالي المشتريات" value={formatShekel(customer.totalSpent)} icon={Coins} hint="بدون الطلبات الملغية" />
        <StatCard label="طلبات مكتملة" value={customer.completedOrders} icon={CheckCircle2} tone="success" />
        <StatCard label="طلبات ملغية" value={customer.cancelledOrders} icon={XCircle} tone="danger" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <h2 className="mb-3 font-display text-lg font-semibold">سجل الطلبات</h2>
          <TableWrap>
            <table className="w-full min-w-[560px]">
              <thead><tr><Th>رقم الطلب</Th><Th>التاريخ</Th><Th>الاستلام</Th><Th>الإجمالي</Th><Th>الحالة</Th></tr></thead>
              <tbody>
                {orders.data?.items.map((o) => (
                  <tr key={o.id} className="hover:bg-ivory/50">
                    <Td><Link to={`/admin/orders/${o.id}`} className="ltr-nums font-semibold text-cocoa hover:underline">{o.orderNumber}</Link></Td>
                    <Td className="text-xs text-muted-foreground">{formatDateTime(o.createdAt)}</Td>
                    <Td>{o.deliveryMethod === 'PICKUP' ? 'استلام' : 'توصيل'}</Td>
                    <Td className="font-medium">{formatShekel(o.total)}</Td>
                    <Td><OrderStatusBadge status={o.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          {orders.data && <Pagination page={page} totalPages={orders.data.pagination.totalPages} onChange={setPage} />}
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base">ملاحظات داخلية عن الزبون</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثلاً: يفضل التواصل مساءً" />
            <Button size="sm" variant="outline" loading={save.isPending} disabled={notes === (customer.notes ?? '')} onClick={() => save.mutate()}>حفظ</Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
