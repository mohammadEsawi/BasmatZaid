import { Fragment, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Boxes, History, PackageX, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton, TableWrap, Td, Th } from '@/components/ui/misc';
import { AvailabilityBadge, ErrorBox, PageHeader, Pagination, SearchInput, StatCard } from '@/components/admin/AdminUi';
import { StockAdjustDialog, type StockTarget } from '@/components/admin/StockAdjustDialog';
import { ProductImage } from '@/components/store/ProductBits';
import { useDebounced } from '@/hooks/useDebounced';
import { adminApi } from '@/services/admin';
import { cn, formatDateTime } from '@/lib/utils';
import type { InventoryMovement, InventoryRow } from '@/types';

const MOVEMENT_LABEL: Record<InventoryMovement['movementType'], { label: string; variant: 'info' | 'danger' | 'success' | 'neutral' }> = {
  INITIAL_STOCK: { label: 'مخزون افتتاحي', variant: 'info' },
  ORDER_DEDUCTION: { label: 'خصم طلب', variant: 'danger' },
  ORDER_CANCELLATION_RESTORE: { label: 'إرجاع إلغاء', variant: 'success' },
  MANUAL_ADJUSTMENT: { label: 'تعديل يدوي', variant: 'neutral' },
};

export default function InventoryPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'history' ? 'history' : 'stock';
  return (
    <>
      <PageHeader title="المخزون" description="الكميات المتوفرة والمحجوزة والمباعة وسجل حركة المخزون" />
      <div className="mb-5 inline-flex rounded-full bg-white p-1 shadow-soft">
        {[
          { id: 'stock', label: 'الكميات', icon: Boxes },
          { id: 'history', label: 'سجل الحركات', icon: History },
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setParams(id === 'stock' ? {} : { tab: id })} className={cn('flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition', tab === id ? 'bg-cocoa text-white' : 'text-muted-foreground hover:text-charcoal')}>
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>
      {tab === 'stock' ? <StockTab /> : <HistoryTab />}
    </>
  );
}

function toTarget(row: InventoryRow, variantId?: string): StockTarget {
  return {
    productId: row.id,
    productName: row.name,
    stock: row.available,
    variants: row.variants.map((v) => ({ id: v.id, label: v.label, stock: v.available })),
    initialVariantId: variantId,
  };
}

function StockTab() {
  const [params, setParams] = useSearchParams();
  const filter = (params.get('filter') as 'all' | 'low' | 'out') || 'all';
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [target, setTarget] = useState<StockTarget | null>(null);
  const query = useQuery({ queryKey: ['admin', 'inventory', { filter, debounced }], queryFn: () => adminApi.inventory({ filter, search: debounced }), placeholderData: keepPreviousData });

  if (query.isError) return <ErrorBox error={query.error} onRetry={() => query.refetch()} />;
  const s = query.data?.summary;

  return (
    <>
      {s && (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="القطع المتوفرة" value={s.totalAvailableUnits} icon={Boxes} />
          <StatCard label="محجوزة في طلبات مفتوحة" value={s.totalReservedUnits} icon={History} tone="info" />
          <StatCard label="مخزون منخفض" value={s.lowStock} icon={TriangleAlert} tone="warning" />
          <StatCard label="نفد من المخزون" value={s.outOfStock} icon={PackageX} tone="danger" />
        </div>
      )}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchInput value={search} onChange={setSearch} placeholder="بحث بالاسم أو SKU" className="sm:w-72" />
        <div className="flex gap-1.5">
          {[
            { id: 'all', label: 'الكل' },
            { id: 'low', label: 'منخفض' },
            { id: 'out', label: 'نفد' },
          ].map((f) => (
            <Button key={f.id} size="sm" variant={filter === f.id ? 'default' : 'outline'} className="h-10" onClick={() => setParams(f.id === 'all' ? {} : { filter: f.id })}>{f.label}</Button>
          ))}
        </div>
      </div>
      <TableWrap>
        <table className="w-full min-w-[820px]">
          <thead>
            <tr><Th>المنتج</Th><Th>المتوفر</Th><Th>المحجوز</Th><Th>المباع</Th><Th>الموجود فعلياً</Th><Th>الحالة</Th><Th className="text-left">إجراء</Th></tr>
          </thead>
          <tbody>
            {query.isLoading && <tr><Td colSpan={7}><Skeleton className="h-32" /></Td></tr>}
            {query.data?.items.map((row) => (
              <Fragment key={row.id}>
                <tr className="hover:bg-ivory/50">
                  <Td>
                    <div className="flex items-center gap-3">
                      <div className="size-10 shrink-0 overflow-hidden rounded-lg bg-ivory"><ProductImage src={row.image} alt={row.name} className="size-full" /></div>
                      <div>
                        <Link to={`/admin/products/${row.id}`} className="font-medium hover:text-cocoa">{row.name}</Link>
                        <p className="text-xs text-muted-foreground">{row.category}{row.sku && ` · ${row.sku}`}{!row.isActive && ' · مخفي'} · تنبيه عند {row.lowStockThreshold}</p>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-base font-semibold">{row.available}</Td>
                  <Td>{row.reserved}</Td>
                  <Td>{row.sold}</Td>
                  <Td>{row.onHand}</Td>
                  <Td><AvailabilityBadge availability={row.availability} /></Td>
                  <Td className="text-left">
                    {!row.hasVariants && <Button size="sm" variant="outline" onClick={() => setTarget(toTarget(row))}>تعديل</Button>}
                  </Td>
                </tr>
                {row.variants.map((v) => (
                  <tr key={v.id} className="bg-ivory/30 text-muted-foreground">
                    <Td className="pr-16 text-xs">↳ {v.label}{!v.isActive && ' (غير نشط)'}</Td>
                    <Td className="font-medium text-charcoal">{v.available}</Td>
                    <Td>{v.reserved}</Td>
                    <Td>{v.sold}</Td>
                    <Td>{v.onHand}</Td>
                    <Td />
                    <Td className="text-left"><Button size="sm" variant="ghost" onClick={() => setTarget(toTarget(row, v.id))}>تعديل</Button></Td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {query.data?.items.length === 0 && <tr><Td colSpan={7} className="py-12 text-center text-muted-foreground">لا توجد منتجات</Td></tr>}
          </tbody>
        </table>
      </TableWrap>
      <p className="mt-3 text-xs text-muted-foreground">المحجوز = كميات في طلبات لم تكتمل بعد (تم خصمها من المتوفر). الموجود فعلياً = المتوفر + المحجوز.</p>
      <StockAdjustDialog target={target} onOpenChange={(o) => !o && setTarget(null)} />
    </>
  );
}

function HistoryTab() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const query = useQuery({ queryKey: ['admin', 'movements', { page, type }], queryFn: () => adminApi.movements({ page, type, pageSize: 30 }), placeholderData: keepPreviousData });
  if (query.isError) return <ErrorBox error={query.error} onRetry={() => query.refetch()} />;
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {[{ id: '', label: 'الكل' }, ...Object.entries(MOVEMENT_LABEL).map(([id, v]) => ({ id, label: v.label }))].map((f) => (
          <Button key={f.id} size="sm" variant={type === f.id ? 'default' : 'outline'} onClick={() => { setType(f.id); setPage(1); }}>{f.label}</Button>
        ))}
      </div>
      <TableWrap>
        <table className="w-full min-w-[900px]">
          <thead><tr><Th>التاريخ</Th><Th>المنتج</Th><Th>النوع</Th><Th>التغيير</Th><Th>قبل ← بعد</Th><Th>السبب</Th><Th>الطلب</Th><Th>بواسطة</Th></tr></thead>
          <tbody>
            {query.isLoading && <tr><Td colSpan={8}><Skeleton className="h-32" /></Td></tr>}
            {query.data?.items.map((m) => (
              <tr key={m.id}>
                <Td className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</Td>
                <Td>{m.product?.name}{m.variant && <span className="text-xs text-muted-foreground"> ({m.variant.value})</span>}</Td>
                <Td><Badge variant={MOVEMENT_LABEL[m.movementType].variant}>{MOVEMENT_LABEL[m.movementType].label}</Badge></Td>
                <Td className={cn('ltr-nums font-semibold', m.quantityChange > 0 ? 'text-emerald-700' : 'text-destructive')}>{m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}</Td>
                <Td className="whitespace-nowrap">{m.previousQuantity} ← {m.newQuantity}</Td>
                <Td className="max-w-56 text-xs">{m.reason}</Td>
                <Td>{m.order ? <Link to={`/admin/orders/${m.order.id}`} className="ltr-nums text-cocoa hover:underline">{m.order.orderNumber}</Link> : '—'}</Td>
                <Td className="text-xs">{m.adminUser?.name ?? (m.movementType === 'ORDER_DEDUCTION' ? 'النظام' : '—')}</Td>
              </tr>
            ))}
            {query.data?.items.length === 0 && <tr><Td colSpan={8} className="py-12 text-center text-muted-foreground">لا توجد حركات</Td></tr>}
          </tbody>
        </table>
      </TableWrap>
      {query.data && <Pagination page={page} totalPages={query.data.pagination.totalPages} onChange={setPage} />}
    </>
  );
}
