import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    variant: {
      default: 'bg-primary/10 text-primary',
      success: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15',
      warning: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20',
      danger: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/15',
      info: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/15',
      violet: 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/15',
      neutral: 'bg-stone-100 text-stone-700 ring-1 ring-inset ring-stone-500/15',
      outline: 'border border-border bg-white text-charcoal',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
