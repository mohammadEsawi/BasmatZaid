import { Link } from 'react-router';
import { assetUrl } from '@/services/api';
import { usePublicSettings } from '@/hooks/useStore';
import { cn } from '@/lib/utils';

/** Fingerprint-like mark — "بصمة" means fingerprint/imprint. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('size-10', className)} aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="#E9DDCF" />
      <g fill="none" stroke="#80644F" strokeWidth="2.6" strokeLinecap="round">
        <path d="M32 14c-9 0-16 7.5-16 17" />
        <path d="M32 20c-6 0-10.5 5-10.5 11.5S24 44 27 48" />
        <path d="M32 26c-3 0-5 2.5-5 5.5s2 9 6.5 14" />
        <path d="M32 14c9 0 16 7.5 16 17 0 5-1.5 9.5-4 13" />
        <path d="M32 20c6 0 10.5 5 10.5 11.5 0 4-1 7-2.5 9.5" />
        <path d="M32 26c3 0 5 2.5 5 5.5 0 2.5-.7 4.7-1.7 6.5" />
      </g>
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  const { data } = usePublicSettings();
  const nameAr = data?.business.nameAr || 'بصمة زيد';
  const nameEn = data?.business.nameEn || 'Basmat Zaid';
  const logo = assetUrl(data?.business.logoUrl);

  return (
    <Link to="/" className={cn('flex items-center gap-2.5', className)} aria-label={nameAr}>
      {logo ? <img src={logo} alt={nameAr} className="h-11 w-auto object-contain" /> : <BrandMark />}
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="font-display text-xl font-semibold text-charcoal">{nameAr}</span>
          <span className="mt-1 text-[10px] uppercase tracking-[0.25em] text-taupe">{nameEn}</span>
        </span>
      )}
    </Link>
  );
}
