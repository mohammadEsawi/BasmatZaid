import { ImageOff, Minus, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { BrandMark } from './Brand';
import { assetUrl } from '@/services/api';
import { formatShekel, toAgorot } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { Availability } from '@/types';

export function StockBadge({ availability, quantity, className }: { availability: Availability; quantity?: number; className?: string }) {
  if (availability === 'OUT_OF_STOCK') return <Badge variant="danger" className={className}>نفد من المخزون</Badge>;
  if (availability === 'LOW_STOCK')
    return (
      <Badge variant="warning" className={className}>
        كمية محدودة{quantity !== undefined && <span className="ltr-nums">({quantity})</span>}
      </Badge>
    );
  return <Badge variant="success" className={className}>متوفر</Badge>;
}

export function Price({ price, discountPrice, className, size = 'md' }: { price: string; discountPrice?: string | null; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const hasDiscount = discountPrice && toAgorot(discountPrice) < toAgorot(price);
  const sizes = { sm: 'text-base', md: 'text-lg', lg: 'text-3xl' };
  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-2', className)}>
      <span className={cn('font-semibold text-cocoa', sizes[size])}>{formatShekel(hasDiscount ? discountPrice : price)}</span>
      {hasDiscount && <span className="text-sm text-muted-foreground line-through">{formatShekel(price)}</span>}
    </div>
  );
}

export function ProductImage({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
  const url = assetUrl(src);
  if (!url) {
    return (
      <div className={cn('flex items-center justify-center bg-beige/60', className)} aria-label={alt}>
        <BrandMark className="size-16 opacity-70" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className={cn('object-cover', className)}
      onError={(e) => {
        e.currentTarget.style.display = 'none';
        e.currentTarget.parentElement?.classList.add('bg-beige/60');
      }}
    />
  );
}

export function QuantityStepper({ value, max, onChange, min = 1, size = 'md' }: { value: number; max: number; min?: number; onChange: (v: number) => void; size?: 'sm' | 'md' }) {
  const btn = size === 'sm' ? 'size-8' : 'size-10';
  return (
    <div className="inline-flex items-center rounded-full border border-input bg-white p-1 shadow-sm" dir="ltr">
      <button type="button" className={cn(btn, 'flex items-center justify-center rounded-full text-charcoal transition hover:bg-muted disabled:opacity-40')} onClick={() => onChange(value - 1)} disabled={value <= min} aria-label="إنقاص الكمية">
        <Minus className="size-4" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        className={cn('w-12 bg-transparent text-center font-medium outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none', size === 'sm' ? 'text-sm' : 'text-base')}
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isInteger(n)) onChange(Math.min(Math.max(n, min), Math.max(max, min)));
        }}
        aria-label="الكمية"
      />
      <button type="button" className={cn(btn, 'flex items-center justify-center rounded-full text-charcoal transition hover:bg-muted disabled:opacity-40')} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="زيادة الكمية">
        <Plus className="size-4" />
      </button>
    </div>
  );
}

export function EmptyState({ icon: Icon = ImageOff, title, description, children }: { icon?: React.ComponentType<{ className?: string }>; title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-taupe/40 bg-white/60 px-6 py-14 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-beige/70 text-cocoa">
        <Icon className="size-6" />
      </div>
      <h3 className="font-display text-lg font-semibold text-charcoal">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
