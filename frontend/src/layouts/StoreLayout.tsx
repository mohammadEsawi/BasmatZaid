import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Menu, Search, ShoppingBag, Store } from 'lucide-react';
import { Dialog, DialogTitle, SheetContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Logo } from '@/components/store/Brand';
import { FacebookIcon, InstagramIcon, TikTokIcon, WhatsAppIcon } from '@/components/store/SocialIcons';
import { useCart } from '@/features/cart/CartContext';
import { useCategories, usePublicSettings } from '@/hooks/useStore';
import { cn } from '@/lib/utils';

function useNavItems() {
  const { data: categories } = useCategories();
  return [
    { to: '/', label: 'الرئيسية', end: true },
    { to: '/products', label: 'جميع المنتجات', end: true },
    ...(categories ?? []).slice(0, 5).map((c) => ({ to: `/category/${c.slug}`, label: c.name, end: false })),
    { to: '/contact', label: 'تواصل معنا', end: true },
  ];
}

function SearchBox({ className, onDone }: { className?: string; onDone?: () => void }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [value, setValue] = useState(params.get('search') ?? '');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    navigate(q ? `/products?search=${encodeURIComponent(q)}` : '/products');
    onDone?.();
  };
  return (
    <form onSubmit={submit} className={cn('relative', className)} role="search">
      <Search className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="ابحث عن منتج..." className="h-10 rounded-full bg-ivory/70 pr-10" aria-label="بحث" />
    </form>
  );
}

function Header() {
  const { totalQuantity } = useCart();
  const navItems = useNavItems();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname, location.search]);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-ivory/90 backdrop-blur-md">
      <div className="container flex h-16 items-center gap-3 md:h-20">
        <button className="-mr-1 rounded-full p-2 text-charcoal hover:bg-beige/60 lg:hidden" onClick={() => setOpen(true)} aria-label="القائمة">
          <Menu className="size-6" />
        </button>
        <Logo />

        <nav className="mx-6 hidden items-center gap-1 lg:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cn('rounded-full px-3.5 py-2 text-sm font-medium transition-colors', isActive ? 'bg-beige/80 text-charcoal' : 'text-charcoal/75 hover:bg-beige/50 hover:text-charcoal')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-2">
          <SearchBox className="hidden w-56 md:block xl:w-64" />
          <Link to="/cart" className="relative rounded-full p-2.5 text-charcoal transition hover:bg-beige/60" aria-label={`سلة التسوق (${totalQuantity})`}>
            <ShoppingBag className="size-6" />
            {totalQuantity > 0 && (
              <span className="absolute -left-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-cocoa px-1 text-[11px] font-semibold leading-5 text-white">{totalQuantity > 99 ? '99+' : totalQuantity}</span>
            )}
          </Link>
        </div>
      </div>
      <div className="container pb-3 md:hidden">
        <SearchBox />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <SheetContent aria-describedby={undefined}>
          <DialogTitle className="sr-only">القائمة</DialogTitle>
          <Logo className="mb-2" />
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => cn('rounded-xl px-4 py-3 text-base font-medium', isActive ? 'bg-beige text-charcoal' : 'text-charcoal/80 hover:bg-beige/50')}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </SheetContent>
      </Dialog>
    </header>
  );
}

function StoreClosedBanner() {
  const { data } = usePublicSettings();
  if (!data || (data.store.storeOpen && data.store.acceptingOrders)) return null;
  return (
    <div className="bg-charcoal px-4 py-2.5 text-center text-sm text-white">
      <Store className="mb-0.5 me-1.5 inline size-4" />
      {data.store.closedMessage}
    </div>
  );
}

function Footer() {
  const { data } = usePublicSettings();
  const { data: categories } = useCategories();
  const social = data?.social;
  const socials = [
    { href: social?.instagram, label: 'Instagram', Icon: InstagramIcon },
    { href: social?.facebook, label: 'Facebook', Icon: FacebookIcon },
    { href: social?.tiktok, label: 'TikTok', Icon: TikTokIcon },
    { href: social?.whatsapp || (data?.business.whatsappNumber ? `https://wa.me/${data.business.whatsappNumber}` : ''), label: 'WhatsApp', Icon: WhatsAppIcon },
  ].filter((s) => s.href);

  return (
    <footer className="mt-20 border-t border-border/70 bg-white">
      <div className="container grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-4">
          <Logo />
          <p className="max-w-sm text-sm leading-7 text-muted-foreground">{data?.business.description}</p>
          {socials.length > 0 && (
            <div className="flex gap-2">
              {socials.map(({ href, label, Icon }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="flex size-10 items-center justify-center rounded-full bg-beige/60 text-cocoa transition hover:bg-cocoa hover:text-white">
                  <Icon className="size-5" />
                </a>
              ))}
            </div>
          )}
        </div>
        <div>
          <h4 className="mb-4 font-display text-base font-semibold text-charcoal">التصنيفات</h4>
          <ul className="space-y-2.5 text-sm text-muted-foreground">
            {categories?.map((c) => (
              <li key={c.id}>
                <Link to={`/category/${c.slug}`} className="hover:text-cocoa">{c.name}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="mb-4 font-display text-base font-semibold text-charcoal">تواصل معنا</h4>
          <ul className="space-y-2.5 text-sm text-muted-foreground">
            {data?.business.phone && <li>الهاتف: <span className="ltr-nums">{data.business.phone}</span></li>}
            {data?.business.whatsappNumber && <li>واتساب: <span className="ltr-nums">+{data.business.whatsappNumber}</span></li>}
            {data?.business.address && <li>{data.business.address}</li>}
            <li><Link to="/track" className="hover:text-cocoa">تتبع طلبك</Link></li>
            <li><Link to="/contact" className="hover:text-cocoa">صفحة التواصل</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border/60 py-5 text-center text-xs text-muted-foreground">
        {data?.content.footerText} · © {new Date().getFullYear()} {data?.business.nameAr ?? 'بصمة زيد'}
      </div>
    </footer>
  );
}

function WhatsAppFab() {
  const { data } = usePublicSettings();
  const location = useLocation();
  if (!data?.business.whatsappNumber || location.pathname.startsWith('/checkout')) return null;
  const text = encodeURIComponent(`مرحباً ${data.business.nameAr} 🌸 عندي استفسار`);
  return (
    <a
      href={`https://wa.me/${data.business.whatsappNumber}?text=${text}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="تواصل عبر واتساب"
      className="fixed bottom-5 left-5 z-40 flex size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lift transition hover:scale-105"
    >
      <WhatsAppIcon className="size-7" />
    </a>
  );
}

export function StoreLayout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <StoreClosedBanner />
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <WhatsAppFab />
    </div>
  );
}
