import { useQuery } from '@tanstack/react-query';
import { storefront } from '@/services/storefront';

export function usePublicSettings() {
  return useQuery({ queryKey: ['public-settings'], queryFn: storefront.settings, staleTime: 5 * 60 * 1000 });
}

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: storefront.categories, staleTime: 5 * 60 * 1000 });
}
