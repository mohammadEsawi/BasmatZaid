import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ArrowRight, Boxes, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/misc';
import { SwitchField } from '@/components/ui/switch';
import { ErrorBox, ImageUploader, PageHeader } from '@/components/admin/AdminUi';
import { StockAdjustDialog, stockTargetFor, type StockTarget } from '@/components/admin/StockAdjustDialog';
import { adminApi, type ProductInput } from '@/services/admin';
import { ApiRequestError, errorMessage } from '@/services/api';
import { agorotToString, formatShekel, toAgorot } from '@/lib/money';
import type { AdminProduct } from '@/types';

const money = z.string().trim().regex(/^\d{1,8}(\.\d{1,2})?$/, 'أدخل مبلغاً صحيحاً مثل 15 أو 12.50');
const int = (msg: string) => z.coerce.number({ error: msg }).int(msg).min(0, msg);

const schema = z
  .object({
    name: z.string().trim().min(2, 'اسم المنتج مطلوب').max(150),
    slug: z.string().trim().max(120).optional(),
    description: z.string().max(5000).optional(),
    categoryId: z.string().min(1, 'يرجى اختيار التصنيف'),
    price: money,
    discountPrice: z.string().trim().regex(/^(\d{1,8}(\.\d{1,2})?)?$/, 'سعر الخصم غير صحيح').optional(),
    stockQuantity: int('الكمية يجب أن تكون رقماً صحيحاً'),
    lowStockThreshold: int('الحد يجب أن يكون رقماً صحيحاً'),
    sku: z.string().trim().max(64).optional(),
    isActive: z.boolean(),
    isFeatured: z.boolean(),
    allowCustomization: z.boolean(),
    images: z.array(z.string()),
    variants: z.array(
      z.object({
        id: z.string().optional(),
        name: z.string().trim().min(1, 'مطلوب').max(60),
        value: z.string().trim().min(1, 'مطلوب').max(60),
        priceAdjustment: z.string().trim().regex(/^-?\d{1,8}(\.\d{1,2})?$/, 'غير صحيح'),
        stockQuantity: int('غير صحيح'),
        sku: z.string().trim().max(64).optional(),
        isActive: z.boolean(),
      }),
    ),
    customFields: z.array(
      z.object({
        label: z.string().trim().min(1, 'اسم الحقل مطلوب').max(60),
        fieldType: z.enum(['TEXT', 'TEXTAREA', 'SELECT']),
        optionsText: z.string().optional(),
        isRequired: z.boolean(),
        maxLength: z.coerce.number().int().min(1).max(500),
      }),
    ),
  })
  .superRefine((v, ctx) => {
    if (v.discountPrice && toAgorot(v.discountPrice) >= toAgorot(v.price)) ctx.addIssue({ code: 'custom', path: ['discountPrice'], message: 'سعر الخصم يجب أن يكون أقل من السعر' });
    v.customFields.forEach((f, i) => {
      if (f.fieldType === 'SELECT' && !f.optionsText?.split(/[,،\n]/).some((o) => o.trim())) ctx.addIssue({ code: 'custom', path: ['customFields', i, 'optionsText'], message: 'أضف خيارات مفصولة بفاصلة' });
    });
  });

type Values = z.input<typeof schema>;
type Parsed = z.output<typeof schema>;

const empty: Values = {
  name: '', slug: '', description: '', categoryId: '', price: '', discountPrice: '', stockQuantity: 0, lowStockThreshold: 5, sku: '',
  isActive: true, isFeatured: false, allowCustomization: false, images: [], variants: [], customFields: [],
};

function toValues(p: AdminProduct): Values {
  return {
    name: p.name,
    slug: p.slug,
    description: p.description ?? '',
    categoryId: p.categoryId,
    price: p.price.replace(/\.00$/, ''),
    discountPrice: p.discountPrice?.replace(/\.00$/, '') ?? '',
    stockQuantity: p.ownStockQuantity,
    lowStockThreshold: p.lowStockThreshold,
    sku: p.sku ?? '',
    isActive: p.isActive,
    isFeatured: p.isFeatured,
    allowCustomization: p.allowCustomization,
    images: p.images.map((i) => i.imageUrl),
    variants: p.variants.map((v) => ({ id: v.id, name: v.name, value: v.value, priceAdjustment: v.priceAdjustment.replace(/\.00$/, ''), stockQuantity: v.stockQuantity, sku: v.sku ?? '', isActive: v.isActive })),
    customFields: p.customFields.map((f) => ({ label: f.label, fieldType: f.fieldType, optionsText: f.options.join('، '), isRequired: f.isRequired, maxLength: f.maxLength })),
  };
}

function toPayload(v: Parsed): ProductInput {
  return {
    name: v.name,
    slug: v.slug || null,
    description: v.description || null,
    categoryId: v.categoryId,
    price: v.price,
    discountPrice: v.discountPrice || null,
    stockQuantity: v.stockQuantity,
    lowStockThreshold: v.lowStockThreshold,
    sku: v.sku || null,
    isActive: v.isActive,
    isFeatured: v.isFeatured,
    allowCustomization: v.allowCustomization,
    images: v.images.map((url) => ({ imageUrl: url, altText: v.name })),
    variants: v.variants.map((x) => ({ ...x, sku: x.sku || null })),
    customFields: v.allowCustomization
      ? v.customFields.map((f) => ({
          label: f.label,
          fieldType: f.fieldType,
          options: f.fieldType === 'SELECT' ? (f.optionsText ?? '').split(/[,،\n]/).map((o) => o.trim()).filter(Boolean) : [],
          isRequired: f.isRequired,
          maxLength: f.maxLength,
        }))
      : [],
  };
}

export default function ProductFormPage() {
  const { id } = useParams();
  const isEdit = !!id && id !== 'new';
  const product = useQuery({ queryKey: ['admin', 'product', id], queryFn: () => adminApi.product(id!), enabled: isEdit });

  if (isEdit && product.isLoading) return <Skeleton className="h-[70vh]" />;
  if (isEdit && product.isError) return <ErrorBox error={product.error} onRetry={() => product.refetch()} />;
  return <ProductForm key={isEdit ? id : 'new'} product={isEdit ? product.data : undefined} />;
}

function ProductForm({ product }: { product?: AdminProduct }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const categories = useQuery({ queryKey: ['admin', 'categories'], queryFn: adminApi.categories });
  const [stockTarget, setStockTarget] = useState<StockTarget | null>(null);
  const isEdit = !!product;

  const form = useForm<Values, unknown, Parsed>({ resolver: zodResolver(schema), defaultValues: product ? toValues(product) : empty });
  const { register, control, handleSubmit, setError, formState: { errors } } = form;
  const variants = useFieldArray({ control, name: 'variants' });
  const customFields = useFieldArray({ control, name: 'customFields' });
  const [price, discountPrice, allowCustomization, variantValues] = useWatch({ control, name: ['price', 'discountPrice', 'allowCustomization', 'variants'] });

  // After a stock adjustment the product is refetched: refresh only the (read-only) stock
  // fields so unsaved edits in the rest of the form are kept.
  useEffect(() => {
    if (!product) return;
    form.setValue('stockQuantity', product.ownStockQuantity);
    form.getValues('variants').forEach((v, i) => {
      const fresh = product.variants.find((x) => x.id === v.id);
      if (fresh) form.setValue(`variants.${i}.stockQuantity`, fresh.stockQuantity);
    });
  }, [product, form]);

  // New products start with the store's default low-stock threshold.
  const settings = useQuery({ queryKey: ['admin', 'settings'], queryFn: adminApi.settings, enabled: !product });
  useEffect(() => {
    if (!product && settings.data && !form.formState.dirtyFields.lowStockThreshold) form.setValue('lowStockThreshold', settings.data.store.defaultLowStockThreshold);
  }, [settings.data, product, form]);

  useEffect(() => {
    if (!product && categories.data?.length && !form.getValues('categoryId')) form.setValue('categoryId', categories.data[0].id);
  }, [categories.data, product, form]);

  const save = useMutation({
    mutationFn: (v: Parsed) => (isEdit ? adminApi.updateProduct(product!.id, toPayload(v)) : adminApi.createProduct(toPayload(v))),
    onSuccess: (r) => {
      toast.success(r.message);
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      navigate(isEdit ? '/admin/products' : `/admin/products/${r.data.id}`, { replace: !isEdit });
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      if (e instanceof ApiRequestError) {
        e.errors.forEach((fe) => {
          if (fe.path in empty) setError(fe.path as keyof Values, { message: fe.message });
        });
      }
    },
  });

  const basePrice = discountPrice || price;

  return (
    <>
      <PageHeader
        title={isEdit ? 'تعديل المنتج' : 'إضافة منتج جديد'}
        description={product?.name}
        actions={<Button asChild variant="outline"><Link to="/admin/products"><ArrowRight /> رجوع</Link></Button>}
      />
      <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="grid items-start gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>المعلومات الأساسية</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField label="اسم المنتج" htmlFor="name" required error={errors.name?.message} className="sm:col-span-2">
                <Input id="name" {...register('name')} aria-invalid={!!errors.name} />
              </FormField>
              <FormField label="التصنيف" htmlFor="categoryId" required error={errors.categoryId?.message}>
                <NativeSelect id="categoryId" {...register('categoryId')} aria-invalid={!!errors.categoryId}>
                  <option value="">اختر التصنيف</option>
                  {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}{!c.isActive ? ' (مخفي)' : ''}</option>)}
                </NativeSelect>
              </FormField>
              <FormField label="رمز المنتج (SKU)" htmlFor="sku" error={errors.sku?.message} hint="اختياري، يجب أن يكون فريداً">
                <Input id="sku" dir="ltr" className="text-left" {...register('sku')} />
              </FormField>
              <FormField label="الوصف" htmlFor="description" className="sm:col-span-2">
                <Textarea id="description" rows={5} {...register('description')} />
              </FormField>
              <FormField label="الرابط (slug)" htmlFor="slug" hint="يُنشأ تلقائياً من الاسم إذا تُرك فارغاً" className="sm:col-span-2">
                <Input id="slug" {...register('slug')} />
              </FormField>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>الصور</CardTitle><CardDescription>الصورة الأولى هي الصورة الرئيسية للمنتج</CardDescription></CardHeader>
            <CardContent>
              <Controller control={control} name="images" render={({ field }) => <ImageUploader value={field.value} onChange={field.onChange} folder="products" />} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>السعر والمخزون</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField label="السعر (شيكل)" htmlFor="price" required error={errors.price?.message}>
                <Input id="price" inputMode="decimal" dir="ltr" className="text-left" {...register('price')} aria-invalid={!!errors.price} />
              </FormField>
              <FormField label="سعر بعد الخصم (اختياري)" htmlFor="discountPrice" error={errors.discountPrice?.message}>
                <Input id="discountPrice" inputMode="decimal" dir="ltr" className="text-left" {...register('discountPrice')} aria-invalid={!!errors.discountPrice} />
              </FormField>
              {variants.fields.length === 0 && (
                <FormField
                  label="الكمية المتوفرة"
                  htmlFor="stockQuantity"
                  error={errors.stockQuantity?.message}
                  hint={isEdit ? 'لتغيير الكمية استخدم زر "تعديل المخزون" ليتم تسجيل التعديل في السجل' : 'المخزون الافتتاحي للمنتج'}
                >
                  <div className="flex gap-2">
                    <Input id="stockQuantity" type="number" min={0} dir="ltr" className="text-left" disabled={isEdit} {...register('stockQuantity')} />
                    {isEdit && <Button type="button" variant="outline" onClick={() => setStockTarget(stockTargetFor(product!))}><Boxes /> تعديل المخزون</Button>}
                  </div>
                </FormField>
              )}
              <FormField label="حد التنبيه للمخزون المنخفض" htmlFor="lowStockThreshold" error={errors.lowStockThreshold?.message}>
                <Input id="lowStockThreshold" type="number" min={0} dir="ltr" className="text-left" {...register('lowStockThreshold')} />
              </FormField>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>الخيارات (Variants)</CardTitle>
                <CardDescription>مثل اللون أو الحجم. لكل خيار سعره الإضافي وكميته الخاصة.</CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => variants.append({ name: variants.fields.at(-1) ? variantValues?.at(-1)?.name ?? 'اللون' : 'اللون', value: '', priceAdjustment: '0', stockQuantity: 0, sku: '', isActive: true })}>
                <Plus /> إضافة خيار
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {variants.fields.length === 0 && <p className="text-sm text-muted-foreground">لا توجد خيارات — المنتج يُباع كقطعة واحدة بمخزون واحد.</p>}
              {variants.fields.map((field, i) => {
                const v = variantValues?.[i];
                const final = v ? toAgorot(basePrice || '0') + toAgorot(v.priceAdjustment || '0') : 0;
                return (
                  <div key={field.id} className="grid gap-3 rounded-xl border border-border/70 bg-ivory/40 p-3 sm:grid-cols-12">
                    <FormField label="المجموعة" error={errors.variants?.[i]?.name?.message} className="sm:col-span-2"><Input {...register(`variants.${i}.name`)} placeholder="اللون" /></FormField>
                    <FormField label="القيمة" error={errors.variants?.[i]?.value?.message} className="sm:col-span-3"><Input {...register(`variants.${i}.value`)} placeholder="ذهبي" /></FormField>
                    <FormField label="فرق السعر" error={errors.variants?.[i]?.priceAdjustment?.message} hint={`السعر: ${formatShekel(agorotToString(final))}`} className="sm:col-span-2">
                      <Input dir="ltr" className="text-left" {...register(`variants.${i}.priceAdjustment`)} />
                    </FormField>
                    <FormField label="الكمية" error={errors.variants?.[i]?.stockQuantity?.message} className="sm:col-span-2">
                      <div className="flex gap-1">
                        <Input type="number" min={0} dir="ltr" className="text-left" disabled={!!v?.id} {...register(`variants.${i}.stockQuantity`)} />
                        {v?.id && <Button type="button" variant="outline" size="icon" onClick={() => setStockTarget(stockTargetFor(product!, v.id))} aria-label="تعديل المخزون"><Boxes /></Button>}
                      </div>
                    </FormField>
                    <FormField label="SKU" className="sm:col-span-2"><Input dir="ltr" className="text-left" {...register(`variants.${i}.sku`)} /></FormField>
                    <div className="flex items-end justify-between gap-2 sm:col-span-1 sm:flex-col sm:items-center sm:justify-end">
                      <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" className="accent-cocoa" {...register(`variants.${i}.isActive`)} /> نشط</label>
                      <Button type="button" variant="ghost" size="icon-sm" className="text-destructive" onClick={() => variants.remove(i)} aria-label="حذف الخيار"><Trash2 /></Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>التخصيص</CardTitle><CardDescription>حقول يعبيها الزبون عند الطلب، مثل اسم الطفل أو لون الشريطة</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <Controller control={control} name="allowCustomization" render={({ field }) => (
                <SwitchField id="allowCustomization" label="يدعم الطلبات المخصصة" description="يظهر قسم التخصيص في صفحة المنتج مع حقل ملاحظات إضافية" checked={field.value} onCheckedChange={field.onChange} />
              )} />
              {allowCustomization && (
                <>
                  {customFields.fields.map((field, i) => (
                    <div key={field.id} className="grid gap-3 rounded-xl border border-border/70 bg-ivory/40 p-3 sm:grid-cols-12">
                      <FormField label="اسم الحقل" error={errors.customFields?.[i]?.label?.message} className="sm:col-span-3"><Input {...register(`customFields.${i}.label`)} placeholder="اسم الطفل" /></FormField>
                      <FormField label="النوع" className="sm:col-span-2">
                        <NativeSelect {...register(`customFields.${i}.fieldType`)}>
                          <option value="TEXT">نص قصير</option>
                          <option value="TEXTAREA">نص طويل</option>
                          <option value="SELECT">اختيار من قائمة</option>
                        </NativeSelect>
                      </FormField>
                      <FormField label="الخيارات (للقائمة)" error={errors.customFields?.[i]?.optionsText?.message} hint="مفصولة بفاصلة" className="sm:col-span-4"><Input {...register(`customFields.${i}.optionsText`)} placeholder="أبيض، ذهبي، زهري" /></FormField>
                      <FormField label="أقصى طول" className="sm:col-span-1"><Input type="number" dir="ltr" {...register(`customFields.${i}.maxLength`)} /></FormField>
                      <div className="flex items-end justify-between gap-2 sm:col-span-2">
                        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" className="accent-cocoa" {...register(`customFields.${i}.isRequired`)} /> إجباري</label>
                        <Button type="button" variant="ghost" size="icon-sm" className="text-destructive" onClick={() => customFields.remove(i)} aria-label="حذف الحقل"><Trash2 /></Button>
                      </div>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => customFields.append({ label: '', fieldType: 'TEXT', optionsText: '', isRequired: false, maxLength: 100 })}>
                    <Plus /> إضافة حقل تخصيص
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 xl:sticky xl:top-6">
          <Card>
            <CardHeader><CardTitle>الحالة</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Controller control={control} name="isActive" render={({ field }) => <SwitchField id="isActive" label="نشط" description="يظهر في المتجر ويمكن طلبه" checked={field.value} onCheckedChange={field.onChange} />} />
              <Controller control={control} name="isFeatured" render={({ field }) => <SwitchField id="isFeatured" label="منتج مميز" description="يظهر في قسم المنتجات المميزة" checked={field.value} onCheckedChange={field.onChange} />} />
            </CardContent>
          </Card>
          <Button type="submit" size="lg" className="w-full" loading={save.isPending}>{isEdit ? 'حفظ التعديلات' : 'إضافة المنتج'}</Button>
          {isEdit && <Button asChild variant="ghost" className="w-full"><a href={`/products/${product!.slug}`} target="_blank" rel="noopener noreferrer">عرض في المتجر</a></Button>}
        </div>
      </form>
      <StockAdjustDialog target={stockTarget} onOpenChange={(o) => !o && setStockTarget(null)} />
    </>
  );
}
