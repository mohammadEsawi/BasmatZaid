import { Prisma } from '@prisma/client';

export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

export const ZERO = new Decimal(0);

export function toDecimal(value: Prisma.Decimal | number | string | null | undefined): Decimal {
  if (value === null || value === undefined) return ZERO;
  return value instanceof Decimal ? value : new Decimal(value);
}

/** Price customers actually pay for one unit: discounted base price plus the variant adjustment. */
export function unitPriceFor(
  price: Prisma.Decimal,
  discountPrice: Prisma.Decimal | null,
  priceAdjustment: Prisma.Decimal | null = null,
): Decimal {
  const base = discountPrice ?? price;
  const result = toDecimal(base).plus(toDecimal(priceAdjustment));
  return result.isNegative() ? ZERO : result.toDecimalPlaces(2);
}

/** "15" for whole numbers, "15.50" otherwise — used for API output and WhatsApp text. */
export function formatAmount(value: Prisma.Decimal | number | string): string {
  const fixed = toDecimal(value).toFixed(2);
  return fixed.endsWith('.00') ? fixed.slice(0, -3) : fixed;
}

/** Money sent to clients is always a string with two decimals to avoid float drift. */
export function moneyString(value: Prisma.Decimal | number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return toDecimal(value).toFixed(2);
}
