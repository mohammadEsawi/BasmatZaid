import { lazy, Suspense } from 'react';
import { createBrowserRouter, Link, Outlet, RouterProvider } from 'react-router';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/misc';
import { EmptyState } from '@/components/store/ProductBits';
import { StoreLayout } from '@/layouts/StoreLayout';
import { AuthProvider, RequireAdmin } from '@/features/admin/AuthContext';
import HomePage from '@/pages/store/HomePage';
import ProductsPage from '@/pages/store/ProductsPage';
import ProductPage from '@/pages/store/ProductPage';
import CartPage from '@/pages/store/CartPage';
import CheckoutPage from '@/pages/store/CheckoutPage';
import OrderConfirmationPage from '@/pages/store/OrderConfirmationPage';
import TrackOrderPage from '@/pages/store/TrackOrderPage';
import ContactPage from '@/pages/store/ContactPage';

// The admin area is split into its own bundle so customers never download it.
const AdminLayout = lazy(() => import('@/layouts/AdminLayout').then((m) => ({ default: m.AdminLayout })));
const LoginPage = lazy(() => import('@/pages/admin/LoginPage'));
const DashboardPage = lazy(() => import('@/pages/admin/DashboardPage'));
const AdminProductsPage = lazy(() => import('@/pages/admin/ProductsPage'));
const ProductFormPage = lazy(() => import('@/pages/admin/ProductFormPage'));
const CategoriesPage = lazy(() => import('@/pages/admin/CategoriesPage'));
const InventoryPage = lazy(() => import('@/pages/admin/InventoryPage'));
const OrdersPage = lazy(() => import('@/pages/admin/OrdersPage'));
const OrderDetailsPage = lazy(() => import('@/pages/admin/OrderDetailsPage'));
const CustomersPage = lazy(() => import('@/pages/admin/CustomersPage'));
const CustomerDetailsPage = lazy(() => import('@/pages/admin/CustomersPage').then((m) => ({ default: m.CustomerDetailsPage })));
const DeliverySettingsPage = lazy(() => import('@/pages/admin/DeliverySettingsPage'));
const SiteSettingsPage = lazy(() => import('@/pages/admin/SettingsPages').then((m) => ({ default: m.SiteSettingsPage })));
const StoreSettingsPage = lazy(() => import('@/pages/admin/SettingsPages').then((m) => ({ default: m.StoreSettingsPage })));

function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner className="size-8" />
    </div>
  );
}

function NotFound() {
  return (
    <div className="container max-w-xl py-20">
      <EmptyState title="الصفحة غير موجودة" description="الرابط اللي فتحته غير صحيح أو تم نقل الصفحة.">
        <Button asChild><Link to="/">العودة للرئيسية</Link></Button>
      </EmptyState>
    </div>
  );
}

/** Shown instead of a blank page if a page crashes unexpectedly. */
function RouteError() {
  return (
    <div className="container flex min-h-screen max-w-xl items-center py-20">
      <div className="w-full">
        <EmptyState title="حدث خطأ غير متوقع" description="يرجى تحديث الصفحة والمحاولة مرة أخرى.">
          <Button onClick={() => window.location.reload()}>تحديث الصفحة</Button>
        </EmptyState>
      </div>
    </div>
  );
}

function AdminRoot() {
  return (
    <AuthProvider>
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </AuthProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <StoreLayout />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/products', element: <ProductsPage /> },
      { path: '/category/:slug', element: <ProductsPage /> },
      { path: '/products/:slug', element: <ProductPage /> },
      { path: '/cart', element: <CartPage /> },
      { path: '/checkout', element: <CheckoutPage /> },
      { path: '/order/:orderNumber', element: <OrderConfirmationPage /> },
      { path: '/track', element: <TrackOrderPage /> },
      { path: '/contact', element: <ContactPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  {
    path: '/admin',
    element: <AdminRoot />,
    errorElement: <RouteError />,
    children: [
      { path: 'login', element: <LoginPage /> },
      {
        element: <RequireAdmin />,
        children: [
          {
            element: <AdminLayout />,
            children: [
              { index: true, element: <DashboardPage /> },
              { path: 'products', element: <AdminProductsPage /> },
              { path: 'products/new', element: <ProductFormPage /> },
              { path: 'products/:id', element: <ProductFormPage /> },
              { path: 'categories', element: <CategoriesPage /> },
              { path: 'inventory', element: <InventoryPage /> },
              { path: 'orders', element: <OrdersPage /> },
              { path: 'orders/:id', element: <OrderDetailsPage /> },
              { path: 'customers', element: <CustomersPage /> },
              { path: 'customers/:id', element: <CustomerDetailsPage /> },
              { path: 'settings', element: <SiteSettingsPage /> },
              { path: 'settings/store', element: <StoreSettingsPage /> },
              { path: 'settings/delivery', element: <DeliverySettingsPage /> },
              { path: '*', element: <NotFound /> },
            ],
          },
        ],
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
