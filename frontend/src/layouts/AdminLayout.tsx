import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Boxes, ExternalLink, FolderTree, LayoutDashboard, LogOut, Menu, Package, Settings, ShoppingCart, Store, Truck, Users } from 'lucide-react';
import { Dialog, DialogTitle, SheetContent } from '@/components/ui/dialog';
import { BrandMark } from '@/components/store/Brand';
import { useAuth } from '@/features/admin/AuthContext';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/admin', label: 'الرئيسية', icon: LayoutDashboard, end: true },
  { to: '/admin/products', label: 'المنتجات', icon: Package },
  { to: '/admin/categories', label: 'التصنيفات', icon: FolderTree },
  { to: '/admin/inventory', label: 'المخزون', icon: Boxes },
  { to: '/admin/orders', label: 'الطلبات', icon: ShoppingCart },
  { to: '/admin/customers', label: 'الزبائن', icon: Users },
  { to: '/admin/settings/delivery', label: 'مناطق التوصيل', icon: Truck },
  { to: '/admin/settings', label: 'إعدادات الموقع', icon: Settings, end: true },
  { to: '/admin/settings/store', label: 'إعدادات المتجر', icon: Store },
];

const ROLE_LABEL = { OWNER: 'المالك', ADMIN: 'مدير', STAFF: 'موظف' };

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-2 pb-6">
        <BrandMark className="size-10" />
        <div className="leading-tight">
          <p className="font-display text-lg font-semibold text-charcoal">بصمة زيد</p>
          <p className="text-xs text-muted-foreground">لوحة التحكم</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) => cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition', isActive ? 'bg-cocoa text-white shadow-sm' : 'text-charcoal/75 hover:bg-beige/60 hover:text-charcoal')}
          >
            <Icon className="size-[18px]" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-4 space-y-1 border-t border-border/70 pt-4">
        <a href="/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-charcoal/75 hover:bg-beige/60">
          <ExternalLink className="size-[18px]" /> عرض المتجر
        </a>
        <button
          onClick={async () => {
            await logout();
            navigate('/admin/login', { replace: true });
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-destructive hover:bg-red-50"
        >
          <LogOut className="size-[18px]" /> تسجيل الخروج
        </button>
        {admin && (
          <div className="mt-3 rounded-xl bg-ivory px-3 py-2.5 text-xs">
            <p className="font-medium text-charcoal">{admin.name}</p>
            <p className="text-muted-foreground">{ROLE_LABEL[admin.role]} · {admin.email}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen bg-[#F7F3EE]">
      <aside className="fixed inset-y-0 right-0 z-30 hidden w-64 overflow-y-auto border-l border-border/70 bg-white p-4 lg:block">
        <SidebarContent />
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border/70 bg-white/95 px-4 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded-lg p-1.5 hover:bg-beige/60" aria-label="القائمة"><Menu className="size-6" /></button>
        <BrandMark className="size-8" />
        <span className="font-display font-semibold">لوحة التحكم</span>
      </header>

      <Dialog open={open} onOpenChange={setOpen}>
        <SheetContent className="bg-white" aria-describedby={undefined}>
          <DialogTitle className="sr-only">القائمة</DialogTitle>
          <SidebarContent onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Dialog>

      <main className="lg:mr-64">
        <div className="mx-auto max-w-7xl p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
