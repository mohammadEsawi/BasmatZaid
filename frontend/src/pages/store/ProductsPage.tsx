import { Link, useParams, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, PackageSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/input';
import { ProductGrid } from '@/components/store/ProductCard';
import { EmptyState } from '@/components/store/ProductBits';
import { useCategories } from '@/hooks/useStore';
import { storefront, type ProductQuery } from '@/services/storefront';
import { errorMessage } from '@/services/api';
import { cn } from '@/lib/utils';

const SORTS: { value: NonNullable<ProductQuery['sort']>; label: string }[] = [
  { value: 'newest', label: 'الأحدث' },
  { value: 'price_asc', label: 'السعر: من الأقل' },
  { value: 'price_desc', label: 'السعر: من الأعلى' },
  { value: 'name', label: 'الاسم' },
];

/** All products (/products) and a single category (/category/:slug). */
export default function ProductsPage() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const { data: categories } = useCategories();

  const search = params.get('search') ?? undefined;
  const sort = (params.get('sort') as ProductQuery['sort']) || 'newest';
  const page = Number(params.get('page') ?? 1) || 1;

  const query = useQuery({
    queryKey: ['products', { slug, search, sort, page }],
    queryFn: () => (slug ? storefront.categoryProducts(slug, { search, sort, page }) : storefront.products({ search, sort, page })),
    placeholderData: keepPreviousData,
  });

  const category = slug ? categories?.find((c) => c.slug === slug) : undefined;
  const title = search ? `نتائج البحث عن "${search}"` : category?.name ?? (slug ? 'التصنيف' : 'جميع المنتجات');
  const description = search ? undefined : category?.description ?? (slug ? undefined : 'تصفّح كل قطعنا اليدوية');

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };

  const data = query.data;

  return (
    <div className="container py-8 md:py-12">
      <div className="mb-6 space-y-2">
        <nav className="text-xs text-muted-foreground">
          <Link to="/" className="hover:text-cocoa">الرئيسية</Link> / <span>{slug ? 'التصنيفات' : 'المنتجات'}</span>
        </nav>
        <h1 className="font-display text-3xl font-semibold text-charcoal md:text-4xl">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>

      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
          <CategoryChip to="/products" active={!slug} label="الكل" />
          {categories?.map((c) => <CategoryChip key={c.id} to={`/category/${c.slug}`} active={slug === c.slug} label={c.name} />)}
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-sm text-muted-foreground">ترتيب:</span>
          <NativeSelect value={sort} onChange={(e) => update({ sort: e.target.value })} className="h-10 w-44 rounded-full">
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </NativeSelect>
        </div>
      </div>

      {query.isError ? (
        <EmptyState title="تعذر تحميل المنتجات" description={errorMessage(query.error)}>
          <Button onClick={() => query.refetch()}>إعادة المحاولة</Button>
        </EmptyState>
      ) : !query.isLoading && !data?.items.length ? (
        <EmptyState icon={PackageSearch} title="لا توجد منتجات" description={search ? 'جرّب كلمة بحث مختلفة' : 'لا توجد منتجات في هذا القسم حالياً'}>
          <Button asChild variant="outline"><Link to="/products">تصفح كل المنتجات</Link></Button>
        </EmptyState>
      ) : (
        <div className={cn('transition-opacity', query.isPlaceholderData && 'opacity-60')}>
          <p className="mb-4 text-sm text-muted-foreground">{data?.pagination.total ?? 0} منتج</p>
          <ProductGrid products={data?.items} loading={query.isLoading} />
        </div>
      )}

      {data && data.pagination.totalPages > 1 && (
        <div className="mt-10 flex items-center justify-center gap-3">
          <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })} aria-label="السابق"><ChevronRight /></Button>
          <span className="text-sm">صفحة {page} من {data.pagination.totalPages}</span>
          <Button variant="outline" size="icon" disabled={page >= data.pagination.totalPages} onClick={() => update({ page: String(page + 1) })} aria-label="التالي"><ChevronLeft /></Button>
        </div>
      )}
    </div>
  );
}

function CategoryChip({ to, label, active }: { to: string; label: string; active: boolean }) {
  return (
    <Link to={to} className={cn('shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition', active ? 'border-cocoa bg-cocoa text-white' : 'border-border bg-white text-charcoal hover:border-taupe')}>
      {label}
    </Link>
  );
}
