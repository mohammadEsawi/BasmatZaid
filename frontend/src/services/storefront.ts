import { api, apiRequest } from './api';
import type { Category, CustomerOrder, OrderPayload, OrderQuote, Paginated, Product, ProductDetails, PublicSettings } from '@/types';

export interface ProductQuery {
  category?: string;
  search?: string;
  featured?: boolean;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'name';
  page?: number;
  pageSize?: number;
}

export interface CartCheckResult {
  productId: string;
  variantId: string | null;
  orderable: boolean;
  stockQuantity: number;
  unitPrice: string | null;
  message: string | null;
}

export const storefront = {
  settings: () => api.get<PublicSettings>('/settings/public'),
  categories: () => api.get<Category[]>('/categories'),
  products: (q: ProductQuery = {}) => api.get<Paginated<Product>>('/products', { ...q }),
  product: (slug: string) => api.get<ProductDetails>(`/products/${encodeURIComponent(slug)}`),
  categoryProducts: (slug: string, q: ProductQuery = {}) =>
    api.get<Paginated<Product> & { category: Omit<Category, 'productCount'> }>(`/categories/${encodeURIComponent(slug)}/products`, { ...q }),
  cartCheck: (items: { productId: string; variantId: string | null }[]) => api.post<CartCheckResult[]>('/orders/cart-check', { items }).then((r) => r.data),
  quote: (payload: OrderPayload) => api.post<OrderQuote>('/orders/quote', payload).then((r) => r.data),
  createOrder: (payload: OrderPayload) => apiRequest<CustomerOrder>('/orders', { method: 'POST', body: payload }),
  trackOrder: (orderNumber: string, auth: { token?: string; phone?: string }) => api.get<CustomerOrder>(`/orders/track/${encodeURIComponent(orderNumber)}`, auth),
};
