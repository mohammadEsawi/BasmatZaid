import { describe, expect, it } from 'vitest';
import { agorotToString, formatShekel, toAgorot } from '@/lib/money';
import { addToCart, cartTotals, lineProblem, parseStoredCart, setQuantity, type NewCartItem } from './cartLogic';

const tray: NewCartItem = { productId: 'p1', slug: 'tray', name: 'صينية', image: null, variantId: null, variantLabel: null, unitPrice: '1.10', maxQuantity: 5, customization: [], customNote: null };

describe('money', () => {
  it('calculates in agorot without float drift', () => {
    expect(toAgorot('1.10') * 3).toBe(330);
    expect(agorotToString(330)).toBe('3.30');
    expect(formatShekel('15.00')).toBe('15 شيكل');
    expect(toAgorot('-0.50')).toBe(-50);
  });
});

describe('cart', () => {
  it('merges identical lines and calculates totals', () => {
    let r = addToCart([], tray, 2);
    r = addToCart(r.items, tray, 1);
    expect(r.items).toHaveLength(1);
    expect(cartTotals(r.items)).toMatchObject({ totalQuantity: 3, subtotalAgorot: 330 });
  });

  it('keeps differently personalized pieces separate but shares their stock', () => {
    const a = addToCart([], { ...tray, customNote: 'زيد' }, 3);
    const b = addToCart(a.items, { ...tray, customNote: 'سارة' }, 2);
    expect(b.items).toHaveLength(2);
    expect(addToCart(b.items, { ...tray, customNote: 'ليلى' }, 1).ok).toBe(false);
  });

  it('never exceeds available stock', () => {
    expect(addToCart([], tray, 6).ok).toBe(false);
    expect(addToCart([], { ...tray, maxQuantity: 0 }, 1).ok).toBe(false);
    const { items } = addToCart([], tray, 1);
    expect(setQuantity(items, items[0].key, 6).ok).toBe(false);
    expect(setQuantity(items, items[0].key, 5).items[0].quantity).toBe(5);
  });

  it('removes a line when quantity reaches zero', () => {
    const { items } = addToCart([], tray, 1);
    expect(setQuantity(items, items[0].key, 0).items).toHaveLength(0);
  });

  it('flags lines that went out of stock', () => {
    const { items } = addToCart([], tray, 3);
    expect(lineProblem(items[0], items)).toBeNull();
    const reduced = items.map((i) => ({ ...i, maxQuantity: 2 }));
    expect(lineProblem(reduced[0], reduced)).toContain('2');
  });

  it('ignores corrupted stored carts', () => {
    expect(parseStoredCart('not json')).toEqual([]);
    expect(parseStoredCart('[{"key":1}]')).toEqual([]);
    expect(parseStoredCart(null)).toEqual([]);
  });
});
