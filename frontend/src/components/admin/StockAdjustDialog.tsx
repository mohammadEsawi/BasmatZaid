import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input, NativeSelect } from '@/components/ui/input';
import { adminApi } from '@/services/admin';
import { errorMessage } from '@/services/api';
import { cn } from '@/lib/utils';
import type { AdminProduct } from '@/types';

export interface StockTarget {
  productId: string;
  productName: string;
  variants: { id: string; label: string; stock: number }[];
  /** Stock of the product itself (used when it has no variants) */
  stock: number;
  initialVariantId?: string | null;
}

export function stockTargetFor(p: AdminProduct, variantId?: string | null): StockTarget {
  return {
    productId: p.id,
    productName: p.name,
    stock: p.ownStockQuantity,
    variants: p.variants.map((v) => ({ id: v.id, label: `${v.name}: ${v.value}`, stock: v.stockQuantity })),
    initialVariantId: variantId,
  };
}

/** Manual stock adjustment; every change is recorded in the inventory history with its reason. */
export function StockAdjustDialog({ target, onOpenChange }: { target: StockTarget | null; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [variantId, setVariantId] = useState<string>('');
  const [mode, setMode] = useState<'adjust' | 'set'>('adjust');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!target) return;
    setVariantId(target.initialVariantId ?? target.variants[0]?.id ?? '');
    setMode('adjust');
    setQuantity('');
    setReason('');
  }, [target]);

  const current = target ? (target.variants.length ? target.variants.find((v) => v.id === variantId)?.stock ?? 0 : target.stock) : 0;
  const n = Number(quantity);
  const valid = quantity !== '' && Number.isInteger(n) && (mode === 'set' ? n >= 0 : n !== 0);
  const next = mode === 'set' ? n : current + n;

  const mutation = useMutation({
    mutationFn: () => adminApi.adjustStock(target!.productId, { variantId: target!.variants.length ? variantId : null, mode, quantity: n, reason: reason.trim() }),
    onSuccess: (r) => {
      toast.success(r.message || 'تم تحديث المخزون');
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تعديل المخزون</DialogTitle>
          <DialogDescription>{target?.productName}</DialogDescription>
        </DialogHeader>
        {target && (
          <div className="space-y-4">
            {target.variants.length > 0 && (
              <FormField label="الخيار" htmlFor="stock-variant">
                <NativeSelect id="stock-variant" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
                  {target.variants.map((v) => <option key={v.id} value={v.id}>{v.label} (المتوفر: {v.stock})</option>)}
                </NativeSelect>
              </FormField>
            )}
            <div className="grid grid-cols-2 gap-2 rounded-full bg-muted p-1">
              {(['adjust', 'set'] as const).map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)} className={cn('rounded-full py-2 text-sm font-medium transition', mode === m ? 'bg-white shadow-sm' : 'text-muted-foreground')}>
                  {m === 'adjust' ? 'إضافة / خصم' : 'تحديد الكمية'}
                </button>
              ))}
            </div>
            <FormField label={mode === 'adjust' ? 'الكمية (موجب للإضافة، سالب للخصم)' : 'الكمية الجديدة'} htmlFor="stock-qty" hint={`المتوفر حالياً: ${current}${valid ? ` ← بعد التعديل: ${next}` : ''}`} error={valid && next < 0 ? 'لا يمكن أن يصبح المخزون سالباً' : undefined}>
              <Input id="stock-qty" type="number" inputMode="numeric" dir="ltr" className="text-left" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder={mode === 'adjust' ? 'مثال: 10 أو -2' : 'مثال: 25'} />
            </FormField>
            <FormField label="سبب التعديل" htmlFor="stock-reason" required>
              <Input id="stock-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: إنتاج دفعة جديدة، قطع مكسورة، جرد" />
            </FormField>
          </div>
        )}
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!valid || next < 0 || reason.trim().length < 2}>حفظ التعديل</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
