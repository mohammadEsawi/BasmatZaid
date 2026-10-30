const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EASTERN_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹';

/** Converts Arabic-Indic digits to Latin digits and strips everything except digits and a leading +. */
export function cleanPhone(input: string): string {
  const latin = input.replace(/[٠-٩۰-۹]/g, (d) => {
    const i = ARABIC_INDIC.indexOf(d);
    return String(i >= 0 ? i : EASTERN_ARABIC_INDIC.indexOf(d));
  });
  const trimmed = latin.trim();
  const digits = trimmed.replace(/\D/g, '');
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

/**
 * Normalizes Palestinian / local mobile numbers to the local format 05XXXXXXXX.
 * Accepts 059..., 59..., +970 59..., 00970 59..., +972 5...
 * Returns null when the number is not a valid mobile number.
 */
export function normalizeMobile(input: string): string | null {
  let digits = cleanPhone(input).replace(/^\+/, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('970') || digits.startsWith('972')) digits = `0${digits.slice(3)}`;
  if (/^5\d{8}$/.test(digits)) digits = `0${digits}`;
  return /^05\d{8}$/.test(digits) ? digits : null;
}

/**
 * Converts a phone number to the digits-only international format wa.me expects.
 * Local numbers (starting with 0) get the configured country code.
 */
export function toWhatsAppNumber(input: string, defaultCountryCode = '970'): string {
  let digits = cleanPhone(input).replace(/^\+/, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `${defaultCountryCode}${digits.slice(1)}`;
  return digits;
}
