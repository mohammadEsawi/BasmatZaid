import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Gift, HandHeart, Sparkles, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { BrandMark } from '@/components/store/Brand';
import { ProductGrid } from '@/components/store/ProductCard';
import { ProductImage } from '@/components/store/ProductBits';
import { WhatsAppIcon } from '@/components/store/SocialIcons';
import { useCategories, usePublicSettings } from '@/hooks/useStore';
import { assetUrl } from '@/services/api';
import { storefront } from '@/services/storefront';

function SectionHeader({ title, subtitle, to }: { title: string; subtitle?: string; to?: string }) {
  return (
    <div className="mb-7 flex items-end justify-between gap-4">
      <div>
        <h2 className="section-title">{title}</h2>
        {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {to && (
        <Link to={to} className="flex shrink-0 items-center gap-1 text-sm font-medium text-cocoa hover:underline">
          عرض الكل <ArrowLeft className="size-4" />
        </Link>
      )}
    </div>
  );
}

function Hero() {
  const { data, isLoading } = usePublicSettings();
  const heroImage = assetUrl(data?.content.heroImage);
  return (
    <section className="relative overflow-hidden border-b border-border/50 bg-gradient-to-b from-ivory to-[#F4EDE4]">
      <div className="container grid items-center gap-10 py-12 md:grid-cols-2 md:py-20">
        <div className="space-y-6 text-center md:text-right">
          <span className="inline-flex items-center gap-2 rounded-full border border-taupe/30 bg-white/70 px-3.5 py-1.5 text-xs font-medium text-cocoa">
            <HandHeart className="size-4" /> مصنوع يدوياً بحب
          </span>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="mx-auto h-12 w-3/4 md:mx-0" />
              <Skeleton className="mx-auto h-5 w-full md:mx-0" />
            </div>
          ) : (
            <>
              <h1 className="font-display text-4xl font-bold leading-[1.25] text-charcoal md:text-5xl lg:text-6xl">{data?.content.heroTitle}</h1>
              <p className="mx-auto max-w-lg text-base leading-8 text-charcoal/70 md:mx-0 md:text-lg">{data?.content.heroSubtitle}</p>
            </>
          )}
          <div className="flex flex-wrap justify-center gap-3 md:justify-start">
            <Button asChild size="lg">
              <Link to="/products">تسوّق الآن</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/contact">اطلب قطعة مخصصة</Link>
            </Button>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-md">
          <div className="absolute -inset-6 rounded-[3rem] bg-beige/50 blur-2xl" aria-hidden />
          <div className="relative aspect-[4/5] overflow-hidden rounded-[2.5rem] border-8 border-white bg-beige/60 shadow-lift">
            {heroImage ? (
              <img src={heroImage} alt={data?.business.nameAr} className="size-full object-cover" />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-4 bg-[radial-gradient(circle_at_30%_20%,#fff_0,#E9DDCF_70%)]">
                <BrandMark className="size-40" />
                <span className="font-display text-3xl font-semibold text-cocoa">{data?.business.nameAr ?? 'بصمة زيد'}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Highlights() {
  const items = [
    { icon: HandHeart, title: 'شغل يدوي', text: 'كل قطعة بتنصنع بإيدينا بعناية' },
    { icon: Sparkles, title: 'تخصيص كامل', text: 'الاسم، اللون والتصميم على ذوقك' },
    { icon: Gift, title: 'لكل المناسبات', text: 'أعراس، خطوبة، مواليد وأعياد ميلاد' },
    { icon: Truck, title: 'توصيل أو استلام', text: 'توصيل لمناطق مختلفة أو استلام من عنا' },
  ];
  return (
    <section className="container -mt-px py-10">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
        {items.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex flex-col items-center gap-2 rounded-2xl border border-border/60 bg-white p-5 text-center shadow-soft">
            <span className="flex size-11 items-center justify-center rounded-full bg-beige/70 text-cocoa">
              <Icon className="size-5" />
            </span>
            <h3 className="font-sans text-sm font-semibold text-charcoal">{title}</h3>
            <p className="text-xs leading-5 text-muted-foreground">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Categories() {
  const { data, isLoading } = useCategories();
  if (!isLoading && !data?.length) return null;
  return (
    <section className="container py-10">
      <SectionHeader title="تسوّق حسب التصنيف" subtitle="اختاري الفئة اللي بتناسب مناسبتك" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-5 lg:grid-cols-6">
        {isLoading
          ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-[4/5]" />)
          : data!.map((c) => (
              <Link key={c.id} to={`/category/${c.slug}`} className="group relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-2xl border border-border/60 bg-beige/60 shadow-soft transition hover:shadow-lift">
                {c.image ? (
                  <ProductImage src={c.image} alt={c.name} className="absolute inset-0 size-full transition duration-500 group-hover:scale-105" />
                ) : (
                  <BrandMark className="absolute left-1/2 top-[38%] size-20 -translate-x-1/2 -translate-y-1/2 opacity-80 transition group-hover:scale-110" />
                )}
                <div className="relative bg-gradient-to-t from-charcoal/70 via-charcoal/20 to-transparent p-4 pt-12 text-white">
                  <h3 className="font-display text-lg font-semibold">{c.name}</h3>
                  <p className="text-xs text-white/80">{c.productCount} منتج</p>
                </div>
              </Link>
            ))}
      </div>
    </section>
  );
}

function ProductSection({ title, subtitle, featured }: { title: string; subtitle: string; featured?: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ['products', { featured, home: true }],
    queryFn: () => storefront.products({ featured, sort: 'newest', pageSize: 8 }),
  });
  if (!isLoading && !data?.items.length) return null;
  return (
    <section className="container py-10">
      <SectionHeader title={title} subtitle={subtitle} to="/products" />
      <ProductGrid products={data?.items} loading={isLoading} count={4} />
    </section>
  );
}

function About() {
  const { data } = usePublicSettings();
  if (!data) return null;
  const wa = data.business.whatsappNumber;
  return (
    <section id="about" className="container py-14">
      <div className="grid items-center gap-8 overflow-hidden rounded-[2rem] border border-border/60 bg-white p-6 shadow-soft md:grid-cols-[auto_1fr] md:p-12">
        <div className="mx-auto flex size-32 items-center justify-center rounded-full bg-beige/60 md:size-44">
          <BrandMark className="size-24 md:size-32" />
        </div>
        <div className="space-y-4 text-center md:text-right">
          <h2 className="section-title">{data.content.aboutTitle}</h2>
          <p className="whitespace-pre-line leading-8 text-charcoal/75">{data.content.aboutText}</p>
          {wa && (
            <Button asChild variant="whatsapp" size="lg">
              <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`مرحباً ${data.business.nameAr} 🌸 بدي أستفسر عن طلب مخصص`)}`} target="_blank" rel="noopener noreferrer">
                <WhatsAppIcon className="size-5" /> اسألينا عبر واتساب
              </a>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  const { data } = usePublicSettings();
  return (
    <>
      <Hero />
      <Highlights />
      <Categories />
      {data?.content.showFeatured !== false && <ProductSection title="منتجات مميزة" subtitle="قطع مختارة بعناية من مجموعتنا" featured />}
      {data?.content.showLatest !== false && <ProductSection title="وصل حديثاً" subtitle="أحدث القطع اللي نزلت على المتجر" />}
      <About />
    </>
  );
}
