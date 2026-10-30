import { toAgorot } from '@/lib/money';

export interface CartCustomization {
  fieldId: string;
  label: string;
  value: string;
}

export interface CartItem {
  /** Unique per product + variant + personalization, so differently customized pieces are separate lines. */
  key: string;
  productId: string;
  slug: string;
  name: string;
  image: string | null;
  variantId: string | null;
  variantLabel: string | null;
  /** Decimal string from the API, e.g. "15.00" */
  unitPrice: string;
  /** Stock available for this product/variant when last seen */
  maxQuantity: number;
  quantity: number;
  customization: CartCustomization[];
  customNote: string | null;
}

export type NewCartItem = Omit<CartItem, 'key' | 'quantity'>;

export function lineKey(item: Pick<CartItem, 'productId' | 'variantId' | 'customization' | 'customNote'>) {
  const custom = item.customization.map((c) => `${c.fieldId}=${c.value}`).sort().join('&');
  return [item.productId, item.variantId ?? '', custom, item.customNote ?? ''].join('|');
}

/** All lines of one stock row share the same stock (e.g. two differently personalized favors). */
export function quantityForStockRow(items: CartItem[], productId: string, variantId: string | null, exceptKey?: string) {
  return items.filter((i) => i.productId === productId && i.variantId === variantId && i.key !== exceptKey).reduce((s, i) => s + i.quantity, 0);
}

export type CartResult = { ok: true; items: CartItem[] } | { ok: false; items: CartItem[]; message: string };

export function addToCart(items: CartItem[], item: NewCartItem, quantity: number): CartResult {
  if (quantity < 1) return { ok: false, items, message: 'الكمية غير صحيحة' };
  if (item.maxQuantity <= 0) return { ok: false, items, message: 'هذا المنتج نفد من المخزون' };
  const key = lineKey(item);
  const inCart = quantityForStockRow(items, item.productId, item.variantId);
  if (inCart + quantity > item.maxQuantity) {
    const left = Math.max(0, item.maxQuantity - inCart);
    return { ok: false, items, message: left > 0 ? `يمكنك إضافة ${left} قطع فقط، المتوفر ${item.maxQuantity}` : `لديك كل الكمية المتوفرة (${item.maxQuantity}) في السلة` };
  }
  const existing = items.find((i) => i.key === key);
  const next = existing
    ? items.map((i) => (i.key === key ? { ...i, ...item, key, quantity: i.quantity + quantity } : i))
    : [...items, { ...item, key, quantity }];
  // Keep the latest known stock on every line of the same product/variant.
  return { ok: true, items: next.map((i) => (i.productId === item.productId && i.variantId === item.variantId ? { ...i, maxQuantity: item.maxQuantity } : i)) };
}

export function setQuantity(items: CartItem[], key: string, quantity: number): CartResult {
  const line = items.find((i) => i.key === key);
  if (!line) return { ok: false, items, message: 'المنتج غير موجود في السلة' };
  if (quantity < 1) return { ok: true, items: items.filter((i) => i.key !== key) };
  const others = quantityForStockRow(items, line.productId, line.variantId, key);
  const allowed = line.maxQuantity - others;
  if (quantity > allowed) {
    return { ok: false, items, message: `الكمية المتوفرة من "${line.name}" هي ${line.maxQuantity} فقط` };
  }
  return { ok: true, items: items.map((i) => (i.key === key ? { ...i, quantity } : i)) };
}

export function cartTotals(items: CartItem[]) {
  const totalQuantity = items.reduce((s, i) => s + i.quantity, 0);
  const subtotalAgorot = items.reduce((s, i) => s + toAgorot(i.unitPrice) * i.quantity, 0);
  return { totalQuantity, subtotalAgorot, lineCount: items.length };
}

/** Why a cart line can't be ordered right now (based on the last known stock), or null. */
export function lineProblem(item: CartItem, items: CartItem[]): string | null {
  if (item.maxQuantity <= 0) return 'هذا المنتج لم يعد متوفراً، يرجى إزالته من السلة';
  const total = quantityForStockRow(items, item.productId, item.variantId);
  if (total > item.maxQuantity) return `الكمية المتوفرة ${item.maxQuantity} فقط، يرجى تقليل الكمية`;
  return null;
}

export const lineSubtotalAgorot =(item: CartItem) => toAgorot(item.unitPrice) * item.quantity;

/** Defensive parsing of the persisted cart (localStorage may hold stale or tampered data). */
export function parseStoredCart(raw: string | null): CartItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (i): i is CartItem =>
        i && typeof i.key === 'string' && typeof i.productId === 'string' && typeof i.name === 'string' && Number.isInteger(i.quantity) && i.quantity > 0 && typeof i.unitPrice === 'string' && Array.isArray(i.customization),
    );
  } catch {
    return [];
  }
}
