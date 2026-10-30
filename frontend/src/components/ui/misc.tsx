import * as React from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-xl bg-beige/50', className)} {...props} />;
}

export function Separator({ className }: { className?: string }) {
  return <div role="separator" className={cn('h-px w-full bg-border', className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block size-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary', className)} aria-label="جاري التحميل" />;
}

/** Scroll container for tables so wide tables never break the page layout on mobile. */
export function TableWrap({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('w-full overflow-x-auto rounded-2xl border border-border/70 bg-white shadow-soft', className)}>{children}</div>;
}

export const Th = ({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn('whitespace-nowrap bg-ivory/70 px-4 py-3 text-right text-xs font-semibold text-muted-foreground', className)} {...props} />
);
export const Td = ({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn('border-t border-border/60 px-4 py-3 align-middle text-sm', className)} {...props} />
);
