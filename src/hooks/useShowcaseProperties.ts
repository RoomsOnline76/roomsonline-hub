import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ShowcaseProperty {
  id: string;
  slug: string | null;
  name: string;
  city: string;
  country: string;
  images: unknown;
  description: string | null;
  editorial_rating: string | null;
  navigation_tags: string[] | null;
  external_system: string | null;
  why_we_chose_this_place: string | null;
  who_this_suits: string | null;
  what_its_really_like: string | null;
  why_this_place_matters: string | null;
  who_its_not_for: string | null;
  [key: string]: unknown;

}

const SELECT = `
  id, slug, name, city, country, images, description,
  editorial_rating, navigation_tags, external_system,
  why_we_chose_this_place, who_this_suits,
  what_its_really_like, why_this_place_matters, who_its_not_for
`;

/**
 * Single shared fetch of the publicly listable properties.
 *
 * The listing page renders ~15 segment sections; each one used to run its own
 * identical query, producing 15 duplicate round-trips that delayed the first
 * card (and therefore LCP). One cached query key means one request, filtered
 * client-side per segment.
 */
export function useShowcaseProperties() {
  return useQuery({
    queryKey: ["properties-showcase-list"],
    queryFn: async (): Promise<ShowcaseProperty[]> => {
      const { data, error } = await supabase
        .from("properties")
        .select(SELECT)
        .eq("is_active", true)
        .eq("show_on_website", true)
        .is("permanently_deleted_at", null);

      if (error) throw error;
      return (data || []) as unknown as ShowcaseProperty[];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
