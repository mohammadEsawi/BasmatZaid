import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { BrandMark } from '@/components/store/Brand';
import { useAuth } from '@/features/admin/AuthContext';
import { errorMessage } from '@/services/api';

const schema = z.object({
  identifier: z.string().trim().min(1, 'يرجى إدخال اسم المستخدم أو البريد الإلكتروني'),
  password: z.string().min(1, 'يرجى إدخال كلمة المرور'),
});
type Values = z.infer<typeof schema>;

export default function LoginPage() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema) });

  const from = (location.state as { from?: string } | null)?.from;
  const target = from && from.startsWith('/admin') && from !== '/admin/login' ? from : '/admin';
  if (status === 'authenticated') return <Navigate to={target} replace />;

  const onSubmit = async (v: Values) => {
    setError(null);
    try {
      await login(v.identifier, v.password);
      navigate(target, { replace: true });
    } catch (e) {
      setError(errorMessage(e, 'تعذر تسجيل الدخول'));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-ivory to-[#F1E8DD] p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <BrandMark className="mx-auto size-16" />
          <h1 className="mt-4 font-display text-2xl font-semibold text-charcoal">لوحة تحكم بصمة زيد</h1>
          <p className="mt-1 text-sm text-muted-foreground">سجّل الدخول لإدارة المتجر</p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 rounded-3xl border border-border/60 bg-white p-6 shadow-lift">
          <FormField label="اسم المستخدم أو البريد الإلكتروني" htmlFor="identifier" error={errors.identifier?.message}>
            <Input id="identifier" autoComplete="username" dir="ltr" className="text-left" {...register('identifier')} aria-invalid={!!errors.identifier} />
          </FormField>
          <FormField label="كلمة المرور" htmlFor="password" error={errors.password?.message}>
            <div className="relative">
              <Input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" dir="ltr" className="pl-10 text-left" {...register('password')} aria-invalid={!!errors.password} />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </FormField>
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-destructive">{error}</p>}
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
            <Lock /> تسجيل الدخول
          </Button>
        </form>
      </div>
    </div>
  );
}
