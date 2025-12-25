import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PropertyCard } from "@/components/PropertyCard";
import { Skeleton } from "@/components/ui/skeleton";

interface TagCategory {
  tag_name: string;
  category: string;
}

// Map database tag_name to segment filter IDs
const TAG_TO_SEGMENT_MAP: Record<string, string> = {
  "City": "city",
  "Beach": "beach",
  "Mountain": "mountain",
  "Countryside": "countryside",
};

// Helper to shuffle array
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

interface PropertyData {
  id: string;
  slug: string | null;
  name: string;
  city: string;
  country: string;
  images: unknown;
  description: string | null;
  editorial_rating: string | null;
  navigation_tags: string[] | null;
  why_we_chose_this_place: string | null;
  who_this_suits: string | null;
  what_its_really_like: string | null;
  why_this_place_matters: string | null;
  who_its_not_for: string | null;
}

interface SegmentSectionProps {
  title: string;
  tag: string;
  properties: PropertyData[];
  isLoading: boolean;
}

function SegmentSection({ title, tag, properties, isLoading }: SegmentSectionProps) {
  const filteredProperties = properties.filter(p => 
    p.navigation_tags?.includes(tag)
  );

  if (!isLoading && filteredProperties.length === 0) {
    return null;
  }

  return (
    <section className="py-8 sm:py-12">
      <div className="container mx-auto px-3 sm:px-4">
        <div className="mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground inline">
            {title}
          </h2>
          <span className="ml-3 text-xs sm:text-sm text-muted-foreground">
            TAG: {tag}
          </span>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-48 sm:h-52 w-full rounded-lg" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-12 w-full" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {filteredProperties.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function HomePropertySegments() {
  // Fetch tag categories from database
  const { data: tagCategories } = useQuery({
    queryKey: ["navigation-tag-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("navigation_tag_categories")
        .select("tag_name, category");
      if (error) throw error;
      return data as TagCategory[];
    },
  });

  // Fetch all properties
  const { data: properties, isLoading } = useQuery({
    queryKey: ["properties-all-segments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select(`
          id, slug, name, city, country, images, description,
          editorial_rating, navigation_tags,
          why_we_chose_this_place, who_this_suits, 
          what_its_really_like, why_this_place_matters, who_its_not_for
        `)
        .eq("is_active", true)
        .is("permanently_deleted_at", null);

      if (error) throw error;
      return data as PropertyData[];
    },
  });

  // Compute random segments on mount (stable during session via useMemo with empty deps)
  const { randomDestination, randomTypes } = useMemo(() => {
    if (!tagCategories) {
      return { randomDestination: null, randomTypes: [] };
    }

    const destinationTags = tagCategories
      .filter(t => t.category === "destination")
      .map(t => t.tag_name);
    
    const typeTags = tagCategories
      .filter(t => t.category === "type")
      .map(t => t.tag_name);

    // Pick 1 random destination
    const shuffledDestinations = shuffleArray(destinationTags);
    const randomDest = shuffledDestinations[0] || null;

    // Pick 3 random types
    const shuffledTypes = shuffleArray(typeTags);
    const randomTypesSelected = shuffledTypes.slice(0, 3);

    return {
      randomDestination: randomDest,
      randomTypes: randomTypesSelected,
    };
  }, [tagCategories]);

  return (
    <>
      {/* Always show Discover New */}
      <SegmentSection
        title="Discover New"
        tag="New"
        properties={properties || []}
        isLoading={isLoading}
      />

      {/* Show 1 random destination segment */}
      {randomDestination && (
        <SegmentSection
          title={randomDestination}
          tag={randomDestination}
          properties={properties || []}
          isLoading={isLoading}
        />
      )}

      {/* Show 3 random type segments */}
      {randomTypes.map((tag) => (
        <SegmentSection
          key={tag}
          title={tag}
          tag={tag}
          properties={properties || []}
          isLoading={isLoading}
        />
      ))}
    </>
  );
}
