import { api } from './api';
import type {
  AdminCategory,
  AdminOrder,
  AdminProduct,
  AdminSettings,
  AdminUser,
  CustomerDetails,
  CustomerListItem,
  DashboardStats,
  DeliveryArea,
  InventoryMovement,
  InventoryRow,
  OrderListItem,
  OrderStatus,
  Paginated,
  PaymentStatus,
} from '@/types';

type Q = Record<string, string | number | boolean | undefined | null>;

export interface SessionInfo {
  admin: AdminUser;
  csrfToken: string;
  expiresAt: string;
}

export interface ProductInput {
  name: string;
  slug?: string | null;
  description?: string | null;
  categoryId: string;
  price: string;
  discountPrice?: string | null;
  stockQuantity: number;
  lowStockThreshold: number;
  sku?: string | null;
  isActive: boolean;
  isFeatured: boolean;
  allowCustomization: boolean;
  images: { imageUrl: string; altText?: string | null }[];
  variants: { id?: string; name: string; value: string; priceAdjustment: string; stockQuantity: number; sku?: string | null; isActive: boolean }[];
  customFields: { label: string; fieldType: 'TEXT' | 'TEXTAREA' | 'SELECT'; options: string[]; isRequired: boolean; maxLength: number }[];
}

export const adminApi = {
  // Auth
  login: (identifier: string, password: string) => api.post<SessionInfo>('/admin/auth/login', { identifier, password }).then((r) => r.data),
  logout: () => api.post<null>('/admin/auth/logout'),
  me: () => api.get<SessionInfo>('/admin/auth/me'),

  // Dashboard
  stats: () => api.get<DashboardStats>('/admin/dashboard/stats'),
  recentOrders: () => api.get<OrderListItem[]>('/admin/dashboard/recent-orders'),

  // Products
  products: (q: Q) => api.get<Paginated<AdminProduct>>('/admin/products', q),
  product: (id: string) => api.get<AdminProduct>(`/admin/products/${id}`),
  createProduct: (data: ProductInput) => api.post<AdminProduct>('/admin/products', data),
  updateProduct: (id: string, data: ProductInput) => api.put<AdminProduct>(`/admin/products/${id}`, data),
  deleteProduct: (id: string) => api.delete<{ archived: boolean }>(`/admin/products/${id}`),
  setProductStatus: (id: string, data: { isActive?: boolean; isFeatured?: boolean }) => api.patch<AdminProduct>(`/admin/products/${id}/status`, data),
  adjustStock: (id: string, data: { variantId?: string | null; mode: 'set' | 'adjust'; quantity: number; reason: string }) =>
    api.patch<{ movement: InventoryMovement; product: AdminProduct }>(`/admin/products/${id}/stock`, data),

  // Categories
  categories: () => api.get<AdminCategory[]>('/admin/categories'),
  createCategory: (data: Partial<AdminCategory>) => api.post<AdminCategory>('/admin/categories', data),
  updateCategory: (id: string, data: Partial<AdminCategory>) => api.put<AdminCategory>(`/admin/categories/${id}`, data),
  deleteCategory: (id: string) => api.delete<null>(`/admin/categories/${id}`),

  // Inventory
  inventory: (q: Q) => api.get<{ items: InventoryRow[]; summary: { totalProducts: number; lowStock: number; outOfStock: number; totalAvailableUnits: number; totalReservedUnits: number } }>('/admin/inventory', q),
  movements: (q: Q) => api.get<Paginated<InventoryMovement>>('/admin/inventory/movements', q),

  // Orders
  orders: (q: Q) => api.get<Paginated<OrderListItem> & { statusCounts: Partial<Record<OrderStatus, number>> }>('/admin/orders', q),
  order: (id: string) => api.get<AdminOrder>(`/admin/orders/${id}`),
  setOrderStatus: (id: string, status: OrderStatus, note?: string) => api.patch<AdminOrder>(`/admin/orders/${id}/status`, { status, note: note || null }),
  setOrderNotes: (id: string, adminNotes: string) => api.patch<AdminOrder>(`/admin/orders/${id}/notes`, { adminNotes }),
  setOrderPayment: (id: string, paymentStatus: PaymentStatus) => api.patch<AdminOrder>(`/admin/orders/${id}/payment`, { paymentStatus }),

  // Customers
  customers: (q: Q) => api.get<Paginated<CustomerListItem>>('/admin/customers', q),
  customer: (id: string) => api.get<CustomerDetails>(`/admin/customers/${id}`),
  customerOrders: (id: string, q: Q) => api.get<Paginated<OrderListItem>>(`/admin/customers/${id}/orders`, q),
  setCustomerNotes: (id: string, notes: string) => api.patch<CustomerListItem>(`/admin/customers/${id}/notes`, { notes }),

  // Delivery & settings
  deliveryAreas: () => api.get<DeliveryArea[]>('/admin/delivery-areas'),
  createDeliveryArea: (data: Omit<DeliveryArea, 'id'>) => api.post<DeliveryArea>('/admin/delivery-areas', data),
  updateDeliveryArea: (id: string, data: Omit<DeliveryArea, 'id'>) => api.put<DeliveryArea>(`/admin/delivery-areas/${id}`, data),
  deleteDeliveryArea: (id: string) => api.delete<null>(`/admin/delivery-areas/${id}`),
  settings: () => api.get<AdminSettings>('/admin/settings'),
  updateSettings: (data: { [K in keyof AdminSettings]?: Partial<AdminSettings[K]> }) => api.put<AdminSettings>('/admin/settings', data),

  upload: (file: File, folder: 'products' | 'categories' | 'settings') => {
    const form = new FormData();
    form.append('folder', folder);
    form.append('file', file);
    return api.upload<{ url: string }>('/admin/uploads', form).then((r) => r.data.url);
  },
};
