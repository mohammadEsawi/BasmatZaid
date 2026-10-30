import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const dateFormatter = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { timeZone: 'Asia/Hebron', year: 'numeric', month: '2-digit', day: '2-digit' });
const dateTimeFormatter = new Intl.DateTimeFormat('ar-PS-u-nu-latn', {
  timeZone: 'Asia/Hebron',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatDate = (d: string | Date) => dateFormatter.format(new Date(d));
export const formatDateTime = (d: string | Date) => dateTimeFormatter.format(new Date(d));

/** Random key used to make a checkout submission idempotent. */
export function newIdempotencyKey() {
  return crypto.randomUUID();
}
