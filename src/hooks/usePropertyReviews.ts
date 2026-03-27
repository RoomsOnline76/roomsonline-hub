import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ReviewBadge {
  source: string;
  rating: number;
  totalReviews: number;
  url: string;
}

interface Review {
  author: string;
  text: string;
  rating: number;
  date: string | null;
  photo_url: string | null;
  source_url: string | null;
  source: string;
  relative_time?: string;
  title?: string;
}

export function usePropertyReviews(propertyId: string | undefined) {
  return useQuery({
    queryKey: ['property-reviews', propertyId],
    queryFn: async () => {
      if (!propertyId) return { badges: [], reviews: [], tobiBlurb: null };

      const { data, error } = await supabase
        .from('property_review_cache')
        .select('*')
        .eq('property_id', propertyId);

      if (error) throw error;

      const badges: ReviewBadge[] = [];
      const reviews: Review[] = [];
      let tobiBlurb: string | null = null;

      (data || []).forEach((cache: any) => {
        if (cache.overall_rating && cache.overall_rating > 0) {
          badges.push({
            source: cache.source,
            rating: parseFloat(cache.overall_rating),
            totalReviews: cache.total_reviews || 0,
            url: cache.rating_url || '',
          });
        }

        const cacheReviews = (cache.reviews as any[]) || [];
        cacheReviews.forEach((r: any) => {
          reviews.push({ ...r, source: cache.source });
        });

        if (cache.tobi_blurb && !tobiBlurb) {
          tobiBlurb = cache.tobi_blurb;
        }
      });

      // Sort reviews by date, take latest 5
      reviews.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

      // Check if stale (>24h) — trigger background sync
      const oldestSync = (data || []).reduce((min: number, c: any) => {
        const t = new Date(c.synced_at || 0).getTime();
        return t < min ? t : min;
      }, Date.now());

      const isStale = data?.length === 0 || (Date.now() - oldestSync > 24 * 60 * 60 * 1000);

      if (isStale) {
        // Fire and forget background sync
        supabase.functions.invoke('sync-property-reviews', {
          body: { property_id: propertyId },
        }).catch(() => {});
      }

      return {
        badges,
        reviews: reviews.slice(0, 5),
        tobiBlurb,
        isStale,
      };
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
  });
}
