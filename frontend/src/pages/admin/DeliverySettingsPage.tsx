import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input, Textarea } from '@/components/ui/input';
import { Skeleton, TableWrap, Td, Th } from '@/components/ui/misc';
import { SwitchField } from '@/components/ui/switch';
import { ConfirmDialog, ErrorBox, PageHeader } from '@/components/admin/AdminUi';
import { useAuth } from '@/features/admin/AuthContext';
import { adminApi } from '@/services/admin';
import { errorMessage } from '@/services/api';
import { formatShekel } from '@/lib/money';
import type { AdminSettings, DeliveryArea } from '@/types';

const money = z.string().trim().regex(/^\d{1,8}(\.\d{1,2})?$/, 'أدخل مبلغاً صحيحاً');

export default function DeliverySettingsPage() {
  const settings = useQuery({ queryKey: ['admin', 'settings'], queryFn: adminApi.settings });
  return (
    <>
      <PageHeader title="التوصيل والاستلام" description="مناطق التوصيل ورسومها وإعدادات الاستلام من الموقع. الرسوم تُحسب دائماً في الخادم." />
      <div className="space-y-6">
        <AreasCard />
        {settings.isError ? <ErrorBox error={settings.error} /> : settings.data ? <DeliveryOptionsForm settings={settings.data} /> : <Skeleton className="h-80" />}
      </div>
    </>
  );
}

function AreasCard() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const areas = useQuery({ queryKey: ['admin', 'delivery-areas'], queryFn: adminApi.deliveryAreas });
  const [editing, setEditing] = useState<DeliveryArea | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<DeliveryArea | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteDeliveryArea(id),
    onSuccess: (r) => {
      toast.success(r.message);
      setToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'delivery-areas'] });
      queryClient.invalidateQueries({ queryKey: ['public-settings'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>مناطق التوصيل</CardTitle>
          <CardDescription>لكل منطقة رسوم توصيل خاصة بها</CardDescription>
        </div>
        {can('ADMIN') && <Button size="sm" onClick={() => setEditing('new')}><Plus /> إضافة منطقة</Button>}
      </CardHeader>
      <CardContent>
        {areas.isError ? (
          <ErrorBox error={areas.error} onRetry={() => areas.refetch()} />
        ) : (
          <TableWrap className="shadow-none">
            <table className="w-full min-w-[560px]">
              <thead><tr><Th>المنطقة</Th><Th>رسوم التوصيل</Th><Th>مدة التوصيل</Th><Th>الحالة</Th><Th className="text-left">إجراءات</Th></tr></thead>
              <tbody>
                {areas.isLoading && <tr><Td colSpan={5}><Skeleton className="h-20" /></Td></tr>}
                {areas.data?.map((a) => (
                  <tr key={a.id}>
                    <Td className="font-medium">{a.name}</Td>
                    <Td>{formatShekel(a.deliveryFee)}</Td>
                    <Td className="text-muted-foreground">{a.estimatedDeliveryTime ?? '—'}</Td>
                    <Td>{a.isActive ? <Badge variant="success">متاحة</Badge> : <Badge variant="neutral">متوقفة</Badge>}</Td>
                    <Td>
                      {can('ADMIN') && (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon-sm" onClick={() => setEditing(a)} aria-label="تعديل"><Pencil /></Button>
                          <Button variant="ghost" size="icon-sm" className="text-destructive hover:bg-red-50 hover:text-destructive" onClick={() => setToDelete(a)} aria-label="حذف"><Trash2 /></Button>
                        </div>
                      )}
                    </Td>
                  </tr>
                ))}
                {areas.data?.length === 0 && <tr><Td colSpan={5} className="py-8 text-center text-muted-foreground">لا توجد مناطق توصيل — لن يتمكن الزبائن من اختيار التوصيل</Td></tr>}
              </tbody>
            </table>
          </TableWrap>
        )}
      </CardContent>
      {editing && <AreaDialog area={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} title="حذف منطقة التوصيل؟" description={`سيتم حذف "${toDelete?.name}". الطلبات السابقة تحتفظ باسم المنطقة والرسوم.`} confirmLabel="حذف" destructive loading={remove.isPending} onConfirm={() => toDelete && remove.mutate(toDelete.id)} />
    </Card>
  );
}

const areaSchema = z.object({
  name: z.string().trim().min(2, 'اسم المنطقة مطلوب').max(120),
  deliveryFee: money,
  estimatedDeliveryTime: z.string().trim().max(120).optional(),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0),
});
type AreaValues = z.input<typeof areaSchema>;
type AreaParsed = z.output<typeof areaSchema>;

function AreaDialog({ area, onClose }: { area: DeliveryArea | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { register, control, handleSubmit, formState: { errors } } = useForm<AreaValues, unknown, AreaParsed>({
    resolver: zodResolver(areaSchema),
    defaultValues: area
      ? { name: area.name, deliveryFee: area.deliveryFee.replace(/\.00$/, ''), estimatedDeliveryTime: area.estimatedDeliveryTime ?? '', isActive: area.isActive, sortOrder: area.sortOrder }
      : { name: '', deliveryFee: '', estimatedDeliveryTime: '', isActive: true, sortOrder: 0 },
  });
  const save = useMutation({
    mutationFn: (v: AreaParsed) => {
      const data = { ...v, estimatedDeliveryTime: v.estimatedDeliveryTime || null };
      return area ? adminApi.updateDeliveryArea(area.id, data) : adminApi.createDeliveryArea(data);
    },
    onSuccess: (r) => {
      toast.success(r.message);
      queryClient.invalidateQueries({ queryKey: ['admin', 'delivery-areas'] });
      queryClient.invalidateQueries({ queryKey: ['public-settings'] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{area ? 'تعديل المنطقة' : 'إضافة منطقة توصيل'}</DialogTitle></DialogHeader>
        <form id="area-form" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="space-y-4">
          <FormField label="اسم المنطقة" htmlFor="area-name" required error={errors.name?.message}><Input id="area-name" placeholder="نابلس - رفيديا" {...register('name')} aria-invalid={!!errors.name} /></FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="رسوم التوصيل (شيكل)" htmlFor="area-fee" required error={errors.deliveryFee?.message}><Input id="area-fee" inputMode="decimal" dir="ltr" className="text-left" {...register('deliveryFee')} aria-invalid={!!errors.deliveryFee} /></FormField>
            <FormField label="ترتيب العرض" htmlFor="area-order"><Input id="area-order" type="number" min={0} dir="ltr" className="text-left" {...register('sortOrder')} /></FormField>
          </div>
          <FormField label="مدة التوصيل المتوقعة" htmlFor="area-time"><Input id="area-time" placeholder="خلال يومين" {...register('estimatedDeliveryTime')} /></FormField>
          <Controller control={control} name="isActive" render={({ field }) => <SwitchField id="area-active" label="متاحة للزبائن" checked={field.value} onCheckedChange={field.onChange} />} />
        </form>
        <DialogFooter>
          <Button type="submit" form="area-form" loading={save.isPending}>حفظ</Button>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeliveryOptionsForm({ settings }: { settings: AdminSettings }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [d, setD] = useState(settings.delivery);
  const update = <K extends keyof AdminSettings['delivery']>(k: K, v: AdminSettings['delivery'][K]) => setD((s) => ({ ...s, [k]: v }));
  const save = useMutation({
    mutationFn: () => adminApi.updateSettings({ delivery: d }),
    onSuccess: (r) => {
      toast.success(r.message);
      queryClient.setQueryData(['admin', 'settings'], r.data);
      queryClient.invalidateQueries({ queryKey: ['public-settings'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const minValid = d.minOrderAmount === '' || /^\d{1,8}(\.\d{1,2})?$/.test(d.minOrderAmount);

  return (
    <Card>
      <CardHeader><CardTitle>خيارات الاستلام والتوصيل</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <SwitchField id="pickupEnabled" label="الاستلام من الموقع متاح" checked={d.pickupEnabled} onCheckedChange={(v) => update('pickupEnabled', v)} />
          <SwitchField id="deliveryEnabled" label="التوصيل متاح" checked={d.deliveryEnabled} onCheckedChange={(v) => update('deliveryEnabled', v)} />
        </div>
        <FormField label="موقع الاستلام" htmlFor="pickupLocation"><Input id="pickupLocation" value={d.pickupLocation} onChange={(e) => update('pickupLocation', e.target.value)} placeholder="نابلس - رفيديا، بجانب ..." /></FormField>
        <FormField label="تعليمات الاستلام" htmlFor="pickupInstructions"><Textarea id="pickupInstructions" value={d.pickupInstructions} onChange={(e) => update('pickupInstructions', e.target.value)} /></FormField>
        <div className="grid gap-4 md:grid-cols-3">
          <FormField label="مدة تجهيز الاستلام" htmlFor="estimatedPickupTime"><Input id="estimatedPickupTime" value={d.estimatedPickupTime} onChange={(e) => update('estimatedPickupTime', e.target.value)} /></FormField>
          <FormField label="مدة التوصيل العامة" htmlFor="estimatedDeliveryTime"><Input id="estimatedDeliveryTime" value={d.estimatedDeliveryTime} onChange={(e) => update('estimatedDeliveryTime', e.target.value)} /></FormField>
          <FormField label="الحد الأدنى لطلب التوصيل (شيكل)" htmlFor="minOrderAmount" hint="اتركه فارغاً لعدم وجود حد أدنى" error={minValid ? undefined : 'مبلغ غير صحيح'}>
            <Input id="minOrderAmount" inputMode="decimal" dir="ltr" className="text-left" value={d.minOrderAmount} onChange={(e) => update('minOrderAmount', e.target.value.trim())} />
          </FormField>
        </div>
        {can('ADMIN') && <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!minValid}>حفظ الإعدادات</Button>}
      </CardContent>
    </Card>
  );
}
