import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton, TableWrap, Td, Th } from '@/components/ui/misc';
import { AvailabilityBadge, ConfirmDialog, ErrorBox, PageHeader, Pagination, SearchInput } from '@/components/admin/AdminUi';
import { StockAdjustDialog, stockTargetFor, type StockTarget } from '@/components/admin/StockAdjustDialog';
import { ProductImage } from '@/components/store/ProductBits';
import { useAuth } from '@/features/admin/AuthContext';
import { useDebounced } from '@/hooks/useDebounced';
import { adminApi } from '@/services/admin';
import { errorMessage } from '@/services/api';
import { formatShekel } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { AdminProduct } from '@/types';

export default function AdminProductsPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('');
  const [stock, setStock] = useState('');
  const [sort, setSort] = useState('createdAt:desc');
  const [page, setPage] = useState(1);
  const [stockTarget, setStockTarget] = useState<StockTarget | null>(null);
  const [toDelete, setToDelete] = useState<AdminProduct | null>(null);
  const debounced = useDebounced(search);

  const [sortField, dir] = sort.split(':');
  const query = useQuery({
    queryKey: ['admin', 'products', { debounced, categoryId, status, stock, sort, page }],
    queryFn: () => adminApi.products({ search: debounced, categoryId, status, stock, sort: sortField, dir, page, pageSize: 20 }),
    placeholderData: keepPreviousData,
  });
  const categories = useQuery({ queryKey: ['admin', 'categories'], queryFn: adminApi.categories });

  const statusMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { isActive?: boolean; isFeatured?: boolean } }) => adminApi.setProductStatus(id, data),
    onSuccess: (r) => {
      toast.success(r.message);
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteProduct(id),
    onSuccess: (r) => {
      toast.success(r.message);
      setToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="المنتجات"
        description="إدارة منتجات المتجر وأسعارها وكمياتها"
        actions={can('ADMIN') && <Button asChild><Link to="/admin/products/new"><Plus /> إضافة منتج</Link></Button>}
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <SearchInput value={search} onChange={(v) => reset(() => setSearch(v))} placeholder="بحث بالاسم أو SKU" className="lg:col-span-2" />
        <NativeSelect value={categoryId} onChange={(e) => reset(() => setCategoryId(e.target.value))} className="h-10">
          <option value="">كل التصنيفات</option>
          {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </NativeSelect>
        <NativeSelect value={`${status}|${stock}`} onChange={(e) => reset(() => { const [s, st] = e.target.value.split('|'); setStatus(s); setStock(st); })} className="h-10">
          <option value="|">كل الحالات</option>
          <option value="active|">نشط</option>
          <option value="inactive|">مخفي</option>
          <option value="|low">مخزون منخفض</option>
          <option value="|out">نفد المخزون</option>
          <option value="|in">متوفر</option>
        </NativeSelect>
        <NativeSelect value={sort} onChange={(e) => reset(() => setSort(e.target.value))} className="h-10">
          <option value="createdAt:desc">الأحدث</option>
          <option value="createdAt:asc">الأقدم</option>
          <option value="name:asc">الاسم</option>
          <option value="price:asc">السعر: الأقل</option>
          <option value="price:desc">السعر: الأعلى</option>
          <option value="stock:asc">المخزون: الأقل</option>
          <option value="stock:desc">المخزون: الأكثر</option>
        </NativeSelect>
      </div>

      {query.isError ? (
        <ErrorBox error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <TableWrap className={cn(query.isPlaceholderData && 'opacity-60')}>
          <table className="w-full min-w-[860px]">
            <thead>
              <tr><Th>المنتج</Th><Th>التصنيف</Th><Th>السعر</Th><Th>المخزون</Th><Th>نشط</Th><Th>مميز</Th><Th className="text-left">إجراءات</Th></tr>
            </thead>
            <tbody>
              {query.isLoading &&
                Array.from({ length: 5 }, (_, i) => <tr key={i}><Td colSpan={7}><Skeleton className="h-10" /></Td></tr>)}
              {query.data?.items.map((p) => (
                <tr key={p.id} className="hover:bg-ivory/50">
                  <Td>
                    <div className="flex items-center gap-3">
                      <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-ivory"><ProductImage src={p.images[0]?.imageUrl} alt={p.name} className="size-full" /></div>
                      <div className="min-w-0">
                        <Link to={`/admin/products/${p.id}`} className="font-medium hover:text-cocoa">{p.name}</Link>
                        <p className="text-xs text-muted-foreground">{p.sku ?? '—'}{p.hasVariants && ` · ${p.variants.length} خيارات`}</p>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-muted-foreground">{p.category.name}</Td>
                  <Td>
                    <span className="font-medium">{formatShekel(p.effectivePrice)}</span>
                    {p.discountPrice && <span className="ms-1 text-xs text-muted-foreground line-through">{formatShekel(p.price)}</span>}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <span className="w-8 font-semibold">{p.stockQuantity}</span>
                      <AvailabilityBadge availability={p.availability} />
                    </div>
                  </Td>
                  <Td><Switch checked={p.isActive} disabled={!can('ADMIN')} onCheckedChange={(v) => statusMutation.mutate({ id: p.id, data: { isActive: v } })} aria-label="نشط" /></Td>
                  <Td>
                    <button disabled={!can('ADMIN')} onClick={() => statusMutation.mutate({ id: p.id, data: { isFeatured: !p.isFeatured } })} aria-label="مميز" className="rounded-full p-1.5 hover:bg-beige/60 disabled:opacity-50">
                      <Star className={cn('size-5', p.isFeatured ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground')} />
                    </button>
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => setStockTarget(stockTargetFor(p))} title="تعديل المخزون" aria-label="تعديل المخزون"><Boxes /></Button>
                      {can('ADMIN') && (
                        <>
                          <Button asChild variant="ghost" size="icon-sm" title="تعديل" aria-label="تعديل"><Link to={`/admin/products/${p.id}`}><Pencil /></Link></Button>
                          <Button variant="ghost" size="icon-sm" className="text-destructive hover:bg-red-50 hover:text-destructive" onClick={() => setToDelete(p)} title="حذف" aria-label="حذف"><Trash2 /></Button>
                        </>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
              {query.data?.items.length === 0 && <tr><Td colSpan={7} className="py-12 text-center text-muted-foreground">لا توجد منتجات مطابقة</Td></tr>}
            </tbody>
          </table>
        </TableWrap>
      )}
      {query.data && <Pagination page={page} totalPages={query.data.pagination.totalPages} onChange={setPage} />}

      <StockAdjustDialog target={stockTarget} onOpenChange={(o) => !o && setStockTarget(null)} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="حذف المنتج؟"
        description={`سيتم حذف "${toDelete?.name}". إذا كان المنتج موجوداً في طلبات سابقة فسيتم أرشفته بدلاً من حذفه للحفاظ على سجل الطلبات.`}
        confirmLabel="حذف"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => toDelete && deleteMutation.mutate(toDelete.id)}
      />
    </>
  );
}
