import { randomBytes } from 'node:crypto';

/** Builds a URL slug that keeps Arabic letters (browsers display them natively). */
export function slugify(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '') // Arabic diacritics and tatweel
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function randomSuffix(): string {
  return randomBytes(3).toString('hex');
}
