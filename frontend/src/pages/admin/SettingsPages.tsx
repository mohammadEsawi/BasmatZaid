import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/misc';
import { SwitchField } from '@/components/ui/switch';
import { ErrorBox, ImageUploader, PageHeader } from '@/components/admin/AdminUi';
import { useAuth } from '@/features/admin/AuthContext';
import { adminApi } from '@/services/admin';
import { ApiRequestError, errorMessage } from '@/services/api';
import type { AdminSettings } from '@/types';

function useSettingsEditor() {
  const query = useQuery({ queryKey: ['admin', 'settings'], queryFn: adminApi.settings });
  return query;
}

function useSave(onSaved?: (s: AdminSettings) => void) {
  const queryClient = useQueryClient();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof adminApi.updateSettings>[0]) => adminApi.updateSettings(data),
    onSuccess: (r) => {
      setFieldErrors({});
      toast.success(r.message);
      queryClient.setQueryData(['admin', 'settings'], r.data);
      queryClient.invalidateQueries({ queryKey: ['public-settings'] });
      onSaved?.(r.data);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      if (e instanceof ApiRequestError) setFieldErrors(Object.fromEntries(e.errors.map((x) => [x.path, x.message])));
    },
  });
  return { ...mutation, fieldErrors };
}

/** /admin/settings — business info, social links and homepage content. */
export function SiteSettingsPage() {
  const query = useSettingsEditor();
  if (query.isError) return <ErrorBox error={query.error} onRetry={() => query.refetch()} />;
  if (!query.data) return <Skeleton className="h-[70vh]" />;
  return <SiteSettingsForm initial={query.data} />;
}

function SiteSettingsForm({ initial }: { initial: AdminSettings }) {
  const { can } = useAuth();
  const [business, setBusiness] = useState(initial.business);
  const [social, setSocial] = useState(initial.social);
  const [content, setContent] = useState(initial.content);
  const save = useSave();
  const err = save.fieldErrors;
  const b = <K extends keyof typeof business>(k: K, v: (typeof business)[K]) => setBusiness((s) => ({ ...s, [k]: v }));
  const so = <K extends keyof typeof social>(k: K, v: string) => setSocial((s) => ({ ...s, [k]: v }));
  const c = <K extends keyof typeof content>(k: K, v: (typeof content)[K]) => setContent((s) => ({ ...s, [k]: v }));

  return (
    <>
      <PageHeader title="إعدادات الموقع" description="معلومات النشاط، روابط التواصل ومحتوى الصفحة الرئيسية" />
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>معلومات النشاط</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <FormField label="الاسم بالعربية" htmlFor="nameAr"><Input id="nameAr" value={business.nameAr} onChange={(e) => b('nameAr', e.target.value)} /></FormField>
            <FormField label="الاسم بالإنجليزية" htmlFor="nameEn"><Input id="nameEn" dir="ltr" className="text-left" value={business.nameEn} onChange={(e) => b('nameEn', e.target.value)} /></FormField>
            <FormField label="رقم واتساب للطلبات" htmlFor="whatsappNumber" required error={err.whatsappNumber} hint="بالصيغة الدولية بدون + أو أصفار، مثال: 970599123456. تُرسل إليه رسائل الطلبات.">
              <Input id="whatsappNumber" dir="ltr" className="text-left" inputMode="tel" value={business.whatsappNumber} onChange={(e) => b('whatsappNumber', e.target.value)} />
            </FormField>
            <FormField label="رقم الهاتف" htmlFor="phone"><Input id="phone" dir="ltr" className="text-left" value={business.phone} onChange={(e) => b('phone', e.target.value)} /></FormField>
            <FormField label="رمز الدولة الافتراضي" htmlFor="cc" error={err.defaultCountryCode} hint="يُستخدم لتحويل أرقام الزبائن المحلية (05...) لروابط واتساب">
              <Input id="cc" dir="ltr" className="text-left" value={business.defaultCountryCode} onChange={(e) => b('defaultCountryCode', e.target.value)} />
            </FormField>
            <FormField label="العنوان" htmlFor="address"><Input id="address" value={business.address} onChange={(e) => b('address', e.target.value)} /></FormField>
            <FormField label="وصف النشاط" htmlFor="description" className="md:col-span-2"><Textarea id="description" value={business.description} onChange={(e) => b('description', e.target.value)} /></FormField>
            <FormField label="الشعار" className="md:col-span-2" hint="إذا لم يتم رفع شعار يظهر الشعار الافتراضي">
              <ImageUploader single folder="settings" value={business.logoUrl ? [business.logoUrl] : []} onChange={(u) => b('logoUrl', u[0] ?? '')} />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>وسائل التواصل الاجتماعي</CardTitle><CardDescription>روابط كاملة تبدأ بـ https://</CardDescription></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {(['instagram', 'facebook', 'tiktok', 'whatsapp'] as const).map((k) => (
              <FormField key={k} label={{ instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', whatsapp: 'رابط WhatsApp (اختياري)' }[k]} htmlFor={k} error={err[k]}>
                <Input id={k} dir="ltr" className="text-left" placeholder="https://" value={social[k]} onChange={(e) => so(k, e.target.value)} />
              </FormField>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>محتوى الصفحة الرئيسية</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <FormField label="عنوان الواجهة" htmlFor="heroTitle" className="md:col-span-2"><Input id="heroTitle" value={content.heroTitle} onChange={(e) => c('heroTitle', e.target.value)} /></FormField>
            <FormField label="وصف الواجهة" htmlFor="heroSubtitle" className="md:col-span-2"><Textarea id="heroSubtitle" value={content.heroSubtitle} onChange={(e) => c('heroSubtitle', e.target.value)} /></FormField>
            <FormField label="صورة الواجهة" className="md:col-span-2">
              <ImageUploader single folder="settings" value={content.heroImage ? [content.heroImage] : []} onChange={(u) => c('heroImage', u[0] ?? '')} />
            </FormField>
            <FormField label="عنوان قسم من نحن" htmlFor="aboutTitle"><Input id="aboutTitle" value={content.aboutTitle} onChange={(e) => c('aboutTitle', e.target.value)} /></FormField>
            <FormField label="نص التذييل" htmlFor="footerText"><Input id="footerText" value={content.footerText} onChange={(e) => c('footerText', e.target.value)} /></FormField>
            <FormField label="نص قسم من نحن" htmlFor="aboutText" className="md:col-span-2"><Textarea id="aboutText" rows={5} value={content.aboutText} onChange={(e) => c('aboutText', e.target.value)} /></FormField>
            <SwitchField id="showFeatured" label="عرض المنتجات المميزة" description="المنتجات المعلّمة كمميزة من صفحة المنتجات" checked={content.showFeatured} onCheckedChange={(v) => c('showFeatured', v)} />
            <SwitchField id="showLatest" label="عرض أحدث المنتجات" checked={content.showLatest} onCheckedChange={(v) => c('showLatest', v)} />
          </CardContent>
        </Card>

        {can('ADMIN') && (
          <div className="sticky bottom-4 flex justify-end">
            <Button size="lg" className="shadow-lift" loading={save.isPending} onClick={() => save.mutate({ business, social, content })}>حفظ الإعدادات</Button>
          </div>
        )}
      </div>
    </>
  );
}

/** /admin/settings/store — order acceptance and store behaviour. */
export function StoreSettingsPage() {
  const query = useSettingsEditor();
  if (query.isError) return <ErrorBox error={query.error} onRetry={() => query.refetch()} />;
  if (!query.data) return <Skeleton className="h-96" />;
  return <StoreSettingsForm initial={query.data} />;
}

function StoreSettingsForm({ initial }: { initial: AdminSettings }) {
  const { can } = useAuth();
  const [store, setStore] = useState(initial.store);
  const save = useSave();
  const s = <K extends keyof typeof store>(k: K, v: (typeof store)[K]) => setStore((x) => ({ ...x, [k]: v }));

  return (
    <>
      <PageHeader title="إعدادات المتجر" description="التحكم باستقبال الطلبات وسلوك المتجر" />
      <Card>
        <CardContent className="space-y-4 pt-5">
          <SwitchField id="storeOpen" label="المتجر مفتوح" description="عند الإغلاق تظهر رسالة للزبائن ولا يمكن إرسال طلبات" checked={store.storeOpen} onCheckedChange={(v) => s('storeOpen', v)} />
          <SwitchField id="acceptingOrders" label="استقبال طلبات جديدة" description="يمكن إيقاف الطلبات مؤقتاً مع إبقاء المتجر ظاهراً" checked={store.acceptingOrders} onCheckedChange={(v) => s('acceptingOrders', v)} />
          <FormField label="رسالة عند إيقاف الطلبات" htmlFor="closedMessage"><Textarea id="closedMessage" value={store.closedMessage} onChange={(e) => s('closedMessage', e.target.value)} /></FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="العملة" hint="جميع المبالغ بالشيكل"><Input value="شيكل (ILS)" disabled /></FormField>
            <FormField label="حد المخزون المنخفض الافتراضي" htmlFor="lowStock" hint="القيمة المقترحة للمنتجات الجديدة">
              <Input id="lowStock" type="number" min={0} dir="ltr" className="text-left" value={store.defaultLowStockThreshold} onChange={(e) => s('defaultLowStockThreshold', Math.max(0, Number(e.target.value) || 0))} />
            </FormField>
          </div>
          <p className="rounded-xl bg-ivory p-3 text-xs leading-6 text-muted-foreground">
            إعدادات واتساب (رقم استقبال الطلبات) موجودة في <a href="/admin/settings" className="font-medium text-cocoa underline">إعدادات الموقع</a>، وإعدادات الاستلام والتوصيل في <a href="/admin/settings/delivery" className="font-medium text-cocoa underline">مناطق التوصيل</a>.
          </p>
          {can('ADMIN') && <Button loading={save.isPending} onClick={() => save.mutate({ store })}>حفظ</Button>}
        </CardContent>
      </Card>
    </>
  );
}
