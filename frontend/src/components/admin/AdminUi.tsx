import { useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { adminApi } from '@/services/admin';
import { assetUrl, errorMessage } from '@/services/api';
import { cn } from '@/lib/utils';
import type { Availability, OrderStatus, PaymentStatus } from '@/types';

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-semibold text-charcoal md:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, tone = 'default', hint }: { label: string; value: ReactNode; icon: React.ComponentType<{ className?: string }>; tone?: 'default' | 'success' | 'warning' | 'danger' | 'info'; hint?: string }) {
  const tones = {
    default: 'bg-beige/60 text-cocoa',
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
    danger: 'bg-red-50 text-red-700',
    info: 'bg-sky-50 text-sky-700',
  };
  return (
    <div className="rounded-2xl border border-border/60 bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1.5 truncate text-2xl font-semibold text-charcoal">{value}</p>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', tones[tone])}>
          <Icon className="size-5" />
        </span>
      </div>
    </div>
  );
}

export const ORDER_STATUS: Record<OrderStatus, { label: string; variant: BadgeProps['variant'] }> = {
  NEW: { label: 'جديد', variant: 'info' },
  CONFIRMED: { label: 'مؤكد', variant: 'violet' },
  PREPARING: { label: 'قيد التجهيز', variant: 'warning' },
  READY: { label: 'جاهز', variant: 'default' },
  OUT_FOR_DELIVERY: { label: 'قيد التوصيل', variant: 'warning' },
  COMPLETED: { label: 'مكتمل', variant: 'success' },
  CANCELLED: { label: 'ملغي', variant: 'danger' },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const s = ORDER_STATUS[status];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; variant: BadgeProps['variant'] }> = {
  UNPAID: { label: 'غير مدفوع', variant: 'neutral' },
  PAID: { label: 'مدفوع', variant: 'success' },
  REFUNDED: { label: 'مسترد', variant: 'danger' },
};

export function AvailabilityBadge({ availability }: { availability: Availability }) {
  if (availability === 'OUT_OF_STOCK') return <Badge variant="danger">نفد</Badge>;
  if (availability === 'LOW_STOCK') return <Badge variant="warning">منخفض</Badge>;
  return <Badge variant="success">متوفر</Badge>;
}

export function SearchInput({ value, onChange, placeholder = 'بحث...', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-10 pr-9" />
    </div>
  );
}

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-3">
      <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="السابق"><ChevronRight /></Button>
      <span className="text-sm text-muted-foreground">صفحة {page} من {totalPages}</span>
      <Button variant="outline" size="icon-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="التالي"><ChevronLeft /></Button>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'تأكيد',
  destructive,
  loading,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button variant={destructive ? 'destructive' : 'default'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Uploads images to the backend (validated & re-encoded there) and manages an ordered list of URLs. */
export function ImageUploader({ value, onChange, folder, max = 10, single }: { value: string[]; onChange: (urls: string[]) => void; folder: 'products' | 'categories' | 'settings'; max?: number; single?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const limit = single ? 1 : max;

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, Math.max(0, limit - (single ? 0 : value.length)));
    setUploading(list.length);
    const uploaded: string[] = [];
    for (const file of list) {
      try {
        uploaded.push(await adminApi.upload(file, folder));
      } catch (e) {
        toast.error(errorMessage(e, 'فشل رفع الصورة'), { description: file.name });
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (uploaded.length) onChange(single ? uploaded.slice(0, 1) : [...value, ...uploaded]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const move = (from: number, to: number) => {
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {value.map((url, i) => (
          <div key={url} className="group relative size-24 overflow-hidden rounded-xl border border-border bg-ivory">
            <img src={assetUrl(url) ?? ''} alt="" className="size-full object-cover" />
            {!single && i === 0 && <span className="absolute bottom-1 right-1 rounded-full bg-charcoal/80 px-1.5 text-[10px] text-white">رئيسية</span>}
            <div className="absolute inset-x-0 top-0 flex justify-between p-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
              <button type="button" onClick={() => onChange(value.filter((u) => u !== url))} className="rounded-full bg-white/90 p-1 text-destructive shadow" aria-label="حذف الصورة"><X className="size-3.5" /></button>
              {!single && i > 0 && <button type="button" onClick={() => move(i, 0)} className="rounded-full bg-white/90 px-1.5 text-[10px] shadow">رئيسية</button>}
            </div>
          </div>
        ))}
        {Array.from({ length: uploading }, (_, i) => (
          <div key={`u${i}`} className="flex size-24 items-center justify-center rounded-xl border border-dashed border-taupe/50 bg-ivory"><Loader2 className="size-5 animate-spin text-cocoa" /></div>
        ))}
        {(single ? value.length === 0 : value.length < limit) && uploading === 0 && (
          <button type="button" onClick={() => inputRef.current?.click()} className="flex size-24 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-taupe/50 bg-white text-xs text-muted-foreground transition hover:border-cocoa hover:text-cocoa">
            <ImagePlus className="size-5" /> رفع صورة
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple={!single} hidden onChange={(e) => handleFiles(e.target.files)} />
      <p className="text-xs text-muted-foreground">JPG أو PNG أو WEBP، بحد أقصى 5 ميجابايت للصورة{!single && `، حتى ${max} صور`}.</p>
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center text-sm text-destructive">
      <p>{errorMessage(error, 'تعذر تحميل البيانات')}</p>
      {onRetry && <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>إعادة المحاولة</Button>}
    </div>
  );
}
