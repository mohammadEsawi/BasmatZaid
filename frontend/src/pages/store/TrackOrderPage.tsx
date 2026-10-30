import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { PackageSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { OrderSummaryView } from '@/features/orders/OrderSummaryView';
import { normalizeDigits } from '@/features/checkout/checkoutSchema';
import { errorMessage } from '@/services/api';
import { storefront } from '@/services/storefront';

export default function TrackOrderPage() {
  const [orderNumber, setOrderNumber] = useState('');
  const [phone, setPhone] = useState('');
  const track = useMutation({ mutationFn: () => storefront.trackOrder(orderNumber.trim().toUpperCase(), { phone: normalizeDigits(phone) }) });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (orderNumber.trim() && phone.trim()) track.mutate();
  };

  return (
    <div className="container max-w-4xl py-10 md:py-14">
      <div className="mx-auto mb-8 max-w-lg text-center">
        <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-beige/70 text-cocoa"><PackageSearch className="size-6" /></span>
        <h1 className="font-display text-3xl font-semibold">تتبع طلبك</h1>
        <p className="mt-2 text-muted-foreground">أدخل رقم الطلب ورقم الهاتف اللي استخدمته عند الطلب</p>
      </div>
      <Card className="mx-auto mb-8 max-w-lg">
        <CardContent className="pt-5">
          <form onSubmit={submit} className="space-y-4">
            <FormField label="رقم الطلب" htmlFor="orderNumber">
              <Input id="orderNumber" dir="ltr" className="text-left" placeholder="BZ-2026-0001" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
            </FormField>
            <FormField label="رقم الهاتف" htmlFor="trackPhone">
              <Input id="trackPhone" type="tel" dir="ltr" className="text-left" placeholder="05XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </FormField>
            {track.isError && <p className="text-sm text-destructive">{errorMessage(track.error)}</p>}
            <Button type="submit" className="w-full" loading={track.isPending} disabled={!orderNumber.trim() || !phone.trim()}>عرض الطلب</Button>
          </form>
        </CardContent>
      </Card>
      {track.data && <OrderSummaryView order={track.data} />}
    </div>
  );
}
