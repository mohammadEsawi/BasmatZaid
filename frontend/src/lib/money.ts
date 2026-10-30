/**
 * Money arrives from the API as decimal strings ("15.50"). For the cart preview we work in
 * integer agorot (1/100 shekel) so there is no floating-point drift. The backend always
 * recalculates the real totals.
 */
export function toAgorot(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const str = typeof value === 'number' ? value.toFixed(2) : value.trim();
  const negative = str.startsWith('-');
  const [whole, fraction = ''] = str.replace('-', '').split('.');
  const agorot = Number(whole || '0') * 100 + Number((fraction + '00').slice(0, 2));
  return negative ? -agorot : agorot;
}

export function agorotToString(agorot: number): string {
  const sign = agorot < 0 ? '-' : '';
  const abs = Math.abs(agorot);
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;
  return fraction === 0 ? `${sign}${whole}` : `${sign}${whole}.${String(fraction).padStart(2, '0')}`;
}

/** "15 شيكل" / "15.50 شيكل" */
export function formatShekel(value: string | number | null | undefined): string {
  return `${agorotToString(toAgorot(value))} شيكل`;
}
