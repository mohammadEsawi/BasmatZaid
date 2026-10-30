import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input, Textarea } from '@/components/ui/input';
import { Skeleton, TableWrap, Td, Th } from '@/components/ui/misc';
import { SwitchField } from '@/components/ui/switch';
import { ConfirmDialog, ErrorBox, ImageUploader, PageHeader } from '@/components/admin/AdminUi';
import { ProductImage } from '@/components/store/ProductBits';
import { useAuth } from '@/features/admin/AuthContext';
import { adminApi } from '@/services/admin';
import { errorMessage } from '@/services/api';
import type { AdminCategory } from '@/types';

const schema = z.object({
  name: z.string().trim().min(2, 'اسم التصنيف مطلوب').max(80),
  slug: z.string().trim().max(80).optional(),
  description: z.string().trim().max(500).optional(),
  image: z.string().optional(),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0, 'رقم غير صحيح'),
});
type Values = z.input<typeof schema>;
type Parsed = z.output<typeof schema>;

export default function CategoriesPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['admin', 'categories'], queryFn: adminApi.categories });
  const [editing, setEditing] = useState<AdminCategory | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<AdminCategory | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteCategory(id),
    onSuccess: (r) => {
      toast.success(r.message);
      setToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <PageHeader title="التصنيفات" description="تظهر التصنيفات النشطة في قائمة المتجر حسب ترتيب العرض" actions={can('ADMIN') && <Button onClick={() => setEditing('new')}><Plus /> إضافة تصنيف</Button>} />
      {query.isError ? (
        <ErrorBox error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <TableWrap>
          <table className="w-full min-w-[640px]">
            <thead><tr><Th>التصنيف</Th><Th>المنتجات</Th><Th>الترتيب</Th><Th>الحالة</Th><Th className="text-left">إجراءات</Th></tr></thead>
            <tbody>
              {query.isLoading && <tr><Td colSpan={5}><Skeleton className="h-24" /></Td></tr>}
              {query.data?.map((c) => (
                <tr key={c.id} className="hover:bg-ivory/50">
                  <Td>
                    <div className="flex items-center gap-3">
                      <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-ivory"><ProductImage src={c.image} alt={c.name} className="size-full" /></div>
                      <div>
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">/{c.slug}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>{c.productCount}</Td>
                  <Td>{c.sortOrder}</Td>
                  <Td>{c.isActive ? <Badge variant="success">ظاهر</Badge> : <Badge variant="neutral">مخفي</Badge>}</Td>
                  <Td>
                    {can('ADMIN') && (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => setEditing(c)} aria-label="تعديل"><Pencil /></Button>
                        <Button variant="ghost" size="icon-sm" className="text-destructive hover:bg-red-50 hover:text-destructive" onClick={() => setToDelete(c)} aria-label="حذف"><Trash2 /></Button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
              {query.data?.length === 0 && <tr><Td colSpan={5} className="py-12 text-center text-muted-foreground">لا توجد تصنيفات بعد</Td></tr>}
            </tbody>
          </table>
        </TableWrap>
      )}

      {editing && <CategoryDialog category={editing === 'new' ? null : editing} onClose={() => setEditing(null)} nextOrder={(query.data?.length ?? 0) + 1} />}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="حذف التصنيف؟"
        description={toDelete?.productCount ? `هذا التصنيف يحتوي على ${toDelete.productCount} منتج. انقل المنتجات أولاً أو قم بإخفائه بدلاً من الحذف.` : `سيتم حذف "${toDelete?.name}" نهائياً.`}
        confirmLabel="حذف"
        destructive
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </>
  );
}

function CategoryDialog({ category, onClose, nextOrder }: { category: AdminCategory | null; onClose: () => void; nextOrder: number }) {
  const queryClient = useQueryClient();
  const { register, control, handleSubmit, formState: { errors } } = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(schema),
    defaultValues: category
      ? { name: category.name, slug: category.slug, description: category.description ?? '', image: category.image ?? '', isActive: category.isActive, sortOrder: category.sortOrder }
      : { name: '', slug: '', description: '', image: '', isActive: true, sortOrder: nextOrder },
  });

  const save = useMutation({
    mutationFn: (v: Parsed) => {
      const data = { ...v, slug: v.slug || null, description: v.description || null, image: v.image || null } as unknown as Partial<AdminCategory>;
      return category ? adminApi.updateCategory(category.id, data) : adminApi.createCategory(data);
    },
    onSuccess: (r) => {
      toast.success(r.message);
      queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{category ? 'تعديل التصنيف' : 'إضافة تصنيف'}</DialogTitle></DialogHeader>
        <form id="category-form" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="space-y-4">
          <FormField label="الاسم" htmlFor="cat-name" required error={errors.name?.message}><Input id="cat-name" {...register('name')} aria-invalid={!!errors.name} /></FormField>
          <FormField label="الرابط (slug)" htmlFor="cat-slug" hint="يُنشأ تلقائياً إذا تُرك فارغاً"><Input id="cat-slug" {...register('slug')} /></FormField>
          <FormField label="الوصف" htmlFor="cat-desc"><Textarea id="cat-desc" {...register('description')} className="min-h-[72px]" /></FormField>
          <FormField label="الصورة">
            <Controller control={control} name="image" render={({ field }) => <ImageUploader single folder="categories" value={field.value ? [field.value] : []} onChange={(urls) => field.onChange(urls[0] ?? '')} />} />
          </FormField>
          <FormField label="ترتيب العرض" htmlFor="cat-order" error={errors.sortOrder?.message}><Input id="cat-order" type="number" min={0} dir="ltr" className="max-w-32 text-left" {...register('sortOrder')} /></FormField>
          <Controller control={control} name="isActive" render={({ field }) => <SwitchField id="cat-active" label="ظاهر في المتجر" checked={field.value} onCheckedChange={field.onChange} />} />
        </form>
        <DialogFooter>
          <Button type="submit" form="category-form" loading={save.isPending}>حفظ</Button>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
