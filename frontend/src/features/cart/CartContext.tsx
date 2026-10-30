import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { addToCart, cartTotals, parseStoredCart, setQuantity, type CartItem, type CartResult, type NewCartItem } from './cartLogic';
import type { CartCheckResult } from '@/services/storefront';

const STORAGE_KEY = 'bz_cart_v1';

interface CartContextValue {
  items: CartItem[];
  totalQuantity: number;
  subtotalAgorot: number;
  addItem: (item: NewCartItem, quantity: number) => CartResult;
  updateQuantity: (key: string, quantity: number) => CartResult;
  removeItem: (key: string) => void;
  clear: () => void;
  /** Applies fresh price/stock data from the server to the cart lines. */
  applyServerCheck: (results: CartCheckResult[]) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      return parseStoredCart(localStorage.getItem(STORAGE_KEY));
    } catch {
      return []; // storage unavailable (private mode / blocked)
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Cart still works for this session without persistence.
    }
  }, [items]);

  // Keep several open tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setItems(parseStoredCart(e.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const addItem = useCallback((item: NewCartItem, quantity: number) => {
    const result = addToCart(items, item, quantity);
    if (result.ok) setItems(result.items);
    return result;
  }, [items]);

  const updateQuantity = useCallback((key: string, quantity: number) => {
    const result = setQuantity(items, key, quantity);
    if (result.ok) setItems(result.items);
    return result;
  }, [items]);

  const removeItem = useCallback((key: string) => setItems((current) => current.filter((i) => i.key !== key)), []);
  const clear = useCallback(() => setItems([]), []);

  const applyServerCheck = useCallback((results: CartCheckResult[]) => {
    setItems((current) =>
      current.map((item) => {
        const r = results.find((x) => x.productId === item.productId && x.variantId === item.variantId);
        if (!r) return item;
        return { ...item, unitPrice: r.unitPrice ?? item.unitPrice, maxQuantity: r.orderable ? r.stockQuantity : 0 };
      }),
    );
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const totals = cartTotals(items);
    return { items, totalQuantity: totals.totalQuantity, subtotalAgorot: totals.subtotalAgorot, addItem, updateQuantity, removeItem, clear, applyServerCheck };
  }, [items, addItem, updateQuantity, removeItem, clear, applyServerCheck]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
