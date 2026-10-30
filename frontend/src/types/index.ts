export type Availability = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
export type DeliveryMethod = 'PICKUP' | 'DELIVERY';
export type OrderStatus = 'NEW' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'OUT_FOR_DELIVERY' | 'COMPLETED' | 'CANCELLED';
export type PaymentStatus = 'UNPAID' | 'PAID' | 'REFUNDED';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER';
export type AdminRole = 'OWNER' | 'ADMIN' | 'STAFF';
export type CustomFieldType = 'TEXT' | 'TEXTAREA' | 'SELECT';

export interface Paginated<T> {
  items: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  productCount: number;
}

export interface ProductImage {
  id: string;
  imageUrl: string;
  altText: string | null;
}

export interface PublicVariant {
  id: string;
  name: string;
  value: string;
  priceAdjustment: string;
  unitPrice: string;
  stockQuantity: number;
  availability: Availability;
}

export interface CustomField {
  id: string;
  label: string;
  fieldType: CustomFieldType;
  options: string[];
  isRequired: boolean;
  maxLength: number;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: string;
  discountPrice: string | null;
  effectivePrice: string;
  stockQuantity: number;
  availability: Availability;
  lowStockThreshold: number;
  isFeatured: boolean;
  allowCustomization: boolean;
  category: { id: string; name: string; slug: string };
  images: ProductImage[];
  hasVariants: boolean;
  variants: PublicVariant[];
  customFields: CustomField[];
  createdAt: string;
}

export interface ProductDetails extends Product {
  related: Product[];
}

export interface DeliveryAreaPublic {
  id: string;
  name: string;
  deliveryFee: string;
  estimatedDeliveryTime: string | null;
}

export interface PublicSettings {
  business: { nameAr: string; nameEn: string; logoUrl: string; phone: string; whatsappNumber: string; address: string; description: string };
  social: { instagram: string; facebook: string; tiktok: string; whatsapp: string };
  content: { heroTitle: string; heroSubtitle: string; heroImage: string; aboutTitle: string; aboutText: string; footerText: string; showFeatured: boolean; showLatest: boolean };
  store: { currency: 'ILS'; storeOpen: boolean; acceptingOrders: boolean; closedMessage: string };
  delivery: {
    pickupEnabled: boolean;
    deliveryEnabled: boolean;
    pickupLocation: string;
    pickupInstructions: string;
    estimatedPickupTime: string;
    estimatedDeliveryTime: string;
    minOrderAmount: string;
  };
  deliveryAreas: DeliveryAreaPublic[];
}

export interface CustomizationValue {
  label: string;
  value: string;
}

export interface OrderItemView {
  id: string;
  productId: string | null;
  productSlug: string | null;
  variantId: string | null;
  productName: string;
  productSku: string | null;
  image: string | null;
  variant: { name: string; value: string; sku?: string | null } | null;
  customization: CustomizationValue[];
  quantity: number;
  unitPrice: string;
  subtotal: string;
}

export interface CustomerOrder {
  orderNumber: string;
  trackingToken: string;
  createdAt: string;
  status: OrderStatus;
  statusLabel: string;
  customerName: string;
  customerPhone: string;
  recipientName: string | null;
  recipientPhone: string | null;
  deliveryMethod: DeliveryMethod;
  deliveryArea: string | null;
  deliveryAddress: string | null;
  pickupLocation: string | null;
  pickupTime: string | null;
  items: OrderItemView[];
  totalQuantity: number;
  subtotal: string;
  deliveryFee: string;
  total: string;
  paymentMethod: PaymentMethod;
  customerNotes: string | null;
  whatsappUrl: string | null;
  whatsappMessage: string;
}

export interface OrderQuote {
  items: { productId: string; variantId: string | null; productName: string; variant: { name: string; value: string } | null; customization: CustomizationValue[]; quantity: number; unitPrice: string; subtotal: string }[];
  totalQuantity: number;
  subtotal: string;
  deliveryFee: string;
  total: string;
  deliveryArea: { id: string; name: string } | null;
  pickupLocation: string | null;
}

export interface OrderPayload {
  idempotencyKey?: string;
  customer: { name: string; phone: string };
  recipient?: { name?: string | null; phone?: string | null } | null;
  items: { productId: string; variantId?: string | null; quantity: number; customization: { fieldId: string; value: string }[]; customNote?: string | null }[];
  deliveryMethod: DeliveryMethod;
  deliveryAreaId?: string | null;
  deliveryAddress?: string | null;
  pickupTime?: string | null;
  notes?: string | null;
}

// ---------------- Admin ----------------

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: AdminRole;
}

export interface AdminVariant {
  id: string;
  name: string;
  value: string;
  priceAdjustment: string;
  unitPrice: string;
  stockQuantity: number;
  sku: string | null;
  isActive: boolean;
  availability: Availability;
}

export interface AdminCustomField extends CustomField {
  sortOrder: number;
}

export interface AdminProduct extends Omit<Product, 'variants' | 'customFields' | 'category'> {
  sku: string | null;
  isActive: boolean;
  categoryId: string;
  category: { id: string; name: string; slug: string; isActive: boolean };
  ownStockQuantity: number;
  variants: AdminVariant[];
  customFields: AdminCustomField[];
  updatedAt: string;
}

export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  isActive: boolean;
  sortOrder: number;
  productCount: number;
}

export interface DeliveryArea {
  id: string;
  name: string;
  deliveryFee: string;
  isActive: boolean;
  estimatedDeliveryTime: string | null;
  sortOrder: number;
}

export interface OrderListItem {
  id: string;
  orderNumber: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  deliveryMethod: DeliveryMethod;
  deliveryArea: string | null;
  itemsCount: number;
  totalQuantity: number;
  total: string;
  status: OrderStatus;
  statusLabel: string;
  paymentStatus: PaymentStatus;
}

export interface InventoryMovement {
  id: string;
  productId: string;
  variantId: string | null;
  orderId: string | null;
  movementType: 'INITIAL_STOCK' | 'ORDER_DEDUCTION' | 'ORDER_CANCELLATION_RESTORE' | 'MANUAL_ADJUSTMENT';
  quantityChange: number;
  previousQuantity: number;
  newQuantity: number;
  reason: string | null;
  createdAt: string;
  product?: { id?: string; name: string };
  variant?: { name: string; value: string } | null;
  order?: { id: string; orderNumber: string } | null;
  adminUser?: { id?: string; name: string } | null;
}

export interface AdminOrder {
  id: string;
  orderNumber: string;
  createdAt: string;
  updatedAt: string;
  status: OrderStatus;
  statusLabel: string;
  allowedTransitions: OrderStatus[];
  inventoryStatus: 'NONE' | 'DEDUCTED' | 'RESTORED';
  customer: { id: string; name: string; phone: string; notes: string | null; _count: { orders: number } };
  customerName: string;
  customerPhone: string;
  recipientName: string | null;
  recipientPhone: string | null;
  deliveryMethod: DeliveryMethod;
  deliveryArea: string | null;
  deliveryAddress: string | null;
  pickupLocation: string | null;
  pickupTime: string | null;
  items: OrderItemView[];
  totalQuantity: number;
  subtotal: string;
  deliveryFee: string;
  total: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  customerNotes: string | null;
  adminNotes: string | null;
  statusHistory: { id: string; previousStatus: OrderStatus | null; newStatus: OrderStatus; previousLabel: string | null; newLabel: string; note: string | null; admin: { id: string; name: string } | null; createdAt: string }[];
  inventoryMovements: InventoryMovement[];
  whatsapp: { toCustomerUrl: string | null; toBusinessUrl: string | null; message: string };
}

export interface CustomerListItem {
  id: string;
  name: string;
  phone: string;
  notes: string | null;
  createdAt: string;
  ordersCount: number;
  totalSpent: string;
  lastOrderAt: string | null;
}

export interface CustomerDetails extends CustomerListItem {
  completedOrders: number;
  cancelledOrders: number;
  whatsappUrl: string;
}

export interface InventoryRow {
  id: string;
  name: string;
  sku: string | null;
  image: string | null;
  category: string;
  isActive: boolean;
  lowStockThreshold: number;
  hasVariants: boolean;
  availability: Availability;
  available: number;
  reserved: number;
  sold: number;
  onHand: number;
  variants: { id: string; label: string; sku: string | null; isActive: boolean; available: number; reserved: number; sold: number; onHand: number }[];
}

export interface DashboardStats {
  products: { total: number; active: number; outOfStock: number; lowStock: number };
  orders: { total: number; new: number; pending: number; confirmed: number; preparing: number; ready: number; outForDelivery: number; completed: number; cancelled: number };
  sales: { total: string; completed: string; daily: { day: string; total: string; orders: number }[] };
  bestSellers: { productId: string | null; name: string; quantity: number; revenue: string }[];
}

export interface AdminSettings {
  business: PublicSettings['business'] & { defaultCountryCode: string };
  social: PublicSettings['social'];
  content: PublicSettings['content'];
  store: PublicSettings['store'] & { defaultLowStockThreshold: number };
  delivery: PublicSettings['delivery'];
}
