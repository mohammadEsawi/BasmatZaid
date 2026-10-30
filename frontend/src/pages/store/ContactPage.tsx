import { Link } from 'react-router';
import { MapPin, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { FacebookIcon, InstagramIcon, TikTokIcon, WhatsAppIcon } from '@/components/store/SocialIcons';
import { usePublicSettings } from '@/hooks/useStore';

export default function ContactPage() {
  const { data, isLoading } = usePublicSettings();
  if (isLoading || !data) return <div className="container max-w-3xl py-14"><Skeleton className="h-80" /></div>;

  const wa = data.business.whatsappNumber;
  const socials = [
    { href: data.social.instagram, label: 'Instagram', Icon: InstagramIcon },
    { href: data.social.facebook, label: 'Facebook', Icon: FacebookIcon },
    { href: data.social.tiktok, label: 'TikTok', Icon: TikTokIcon },
  ].filter((s) => s.href);

  return (
    <div className="container max-w-3xl py-10 md:py-14">
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl font-semibold md:text-4xl">تواصل معنا</h1>
        <p className="mx-auto mt-3 max-w-lg leading-7 text-muted-foreground">عندك فكرة لقطعة مخصصة أو استفسار عن طلب؟ احكيلنا وبنرد عليك بأسرع وقت 🤍</p>
      </div>
      <Card>
        <CardContent className="space-y-5 pt-6">
          {wa && (
            <Button asChild variant="whatsapp" size="lg" className="w-full">
              <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`مرحباً ${data.business.nameAr} 🌸`)}`} target="_blank" rel="noopener noreferrer">
                <WhatsAppIcon className="size-5" /> راسلنا على واتساب
              </a>
            </Button>
          )}
          <ul className="space-y-3 text-sm">
            {data.business.phone && (
              <li className="flex items-center gap-3 rounded-xl bg-ivory p-3.5">
                <Phone className="size-5 text-cocoa" />
                <a href={`tel:${data.business.phone}`} className="ltr-nums font-medium">{data.business.phone}</a>
              </li>
            )}
            {data.business.address && (
              <li className="flex items-center gap-3 rounded-xl bg-ivory p-3.5"><MapPin className="size-5 text-cocoa" />{data.business.address}</li>
            )}
            {data.delivery.pickupLocation && (
              <li className="flex items-start gap-3 rounded-xl bg-ivory p-3.5">
                <MapPin className="mt-0.5 size-5 text-cocoa" />
                <span>
                  <span className="block font-medium">موقع الاستلام</span>
                  {data.delivery.pickupLocation}
                </span>
              </li>
            )}
          </ul>
          {socials.length > 0 && (
            <div className="flex justify-center gap-3 pt-2">
              {socials.map(({ href, label, Icon }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="flex size-12 items-center justify-center rounded-full bg-beige/60 text-cocoa transition hover:bg-cocoa hover:text-white">
                  <Icon className="size-5" />
                </a>
              ))}
            </div>
          )}
          <p className="text-center text-sm text-muted-foreground">بدك تعرف وين وصل طلبك؟ <Link to="/track" className="font-medium text-cocoa underline">تتبع الطلب</Link></p>
        </CardContent>
      </Card>
    </div>
  );
}
