import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PropertyCard } from "@/components/PropertyCard";
import { Skeleton } from "@/components/ui/skeleton";
import { BANNER_SEGMENTS } from "@/lib/bannerSegments";
import { SEGMENT_FILTERS, SegmentFilterId, filterPropertiesBySegment } from "@/lib/segmentFilters";

interface TagCategory {
  tag_name: string;
  category: string;
}

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

export interface SegmentSectionProps {
  id?: string;
  title: string;
  tag?: string;
  segmentId?: SegmentFilterId;
  properties: PropertyData[];
  isLoading: boolean;
}

export function SegmentSection({ id, title, tag, segmentId, properties, isLoading }: SegmentSectionProps) {
  // Filter by segmentId if provided, otherwise by tag
  const filteredProperties = useMemo(() => {
    if (segmentId) {
      const segmentTags = SEGMENT_FILTERS[segmentId]?.tags as readonly string[];
      return properties.filter(property => 
        property.navigation_tags?.some(pTag => segmentTags?.includes(pTag))
      );
    }
    if (tag) {
      return properties.filter(p => p.navigation_tags?.includes(tag));
    }
    return properties;
  }, [properties, segmentId, tag]);

  if (!isLoading && filteredProperties.length === 0) {
    return null;
  }

  const segmentConfig = segmentId ? SEGMENT_FILTERS[segmentId] : null;
  const displayTags = segmentConfig?.tags || (tag ? [tag] : []);

  return (
    <section id={id} className="py-6 sm:py-8">
      <div className="container mx-auto px-3 sm:px-4">
        <div className="mb-4">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground inline">
            {title}
          </h2>
          {displayTags.length > 0 && (
            <span className="ml-3 text-xs sm:text-sm text-muted-foreground">
              {displayTags.length === 1 ? `TAG: ${displayTags[0]}` : `TAGS: ${displayTags.join(", ")}`}
            </span>
          )}
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

        {/* 1 property - centered, enlarged */}
        {!isLoading && filteredProperties.length === 1 && (
          <div className="max-w-2xl mx-auto">
            <PropertyCard property={filteredProperties[0]} variant="large" />
          </div>
        )}

        {/* 2 properties - side by side, enlarged */}
        {!isLoading && filteredProperties.length === 2 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {filteredProperties.map((property) => (
              <PropertyCard key={property.id} property={property} variant="large" />
            ))}
          </div>
        )}

        {/* 3+ properties - standard grid */}
        {!isLoading && filteredProperties.length >= 3 && (
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

export function useHomePropertySegments(filteredPropertyIds: string[] | null = null) {
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
    staleTime: 0, // Always fetch fresh data
  });

  // Fetch all properties
  const { data: allProperties, isLoading } = useQuery({
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

  // Filter properties if filteredPropertyIds is provided
  const properties = useMemo(() => {
    if (!allProperties) return [];
    if (filteredPropertyIds === null) return allProperties;
    return allProperties.filter(p => filteredPropertyIds.includes(p.id));
  }, [allProperties, filteredPropertyIds]);

  // Compute random segments based on ALL properties (not filtered) 
  // This ensures the random selection stays stable regardless of search filters
  const { randomDestination, randomTypes } = useMemo(() => {
    if (!tagCategories || !allProperties || allProperties.length === 0) {
      return { randomDestination: null, randomTypes: [] };
    }

    // Get existing tags from ALL properties (not filtered)
    const propertyTags = new Set<string>();
    allProperties.forEach(p => {
      p.navigation_tags?.forEach(tag => propertyTags.add(tag));
    });

    // Only include tags that exist in properties
    const destinationTags = tagCategories
      .filter(t => t.category === "destination" && propertyTags.has(t.tag_name))
      .map(t => t.tag_name);
    
    const typeTags = tagCategories
      .filter(t => t.category === "type" && propertyTags.has(t.tag_name))
      .map(t => t.tag_name);

    // Pick 1 random destination
    const shuffledDestinations = shuffleArray(destinationTags);
    const randomDest = shuffledDestinations[0] || null;

    // Pick 2 random types
    const shuffledTypes = shuffleArray(typeTags);
    const randomTypesSelected = shuffledTypes.slice(0, 2);

    return {
      randomDestination: randomDest,
      randomTypes: randomTypesSelected,
    };
  }, [tagCategories, allProperties]);

  // Generate all segment sections with proper IDs for banner navigation
  const allSegmentSections = useMemo(() => {
    return BANNER_SEGMENTS
      .filter(segment => segment.filterType !== null) // Skip "ALL"
      .map(segment => (
        <SegmentSection
          key={segment.id}
          id={`segment-${segment.id}`}
          title={segment.label}
          segmentId={segment.filterType as SegmentFilterId}
          properties={properties || []}
          isLoading={isLoading}
        />
      ));
  }, [properties, isLoading]);

  return { 
    discoverNewSection: (
      <SegmentSection
        id="segment-discover_new"
        title="Discover New"
        segmentId="discover_new"
        properties={properties || []}
        isLoading={isLoading}
      />
    ),
    destinationSection: randomDestination ? (
      <SegmentSection
        title={randomDestination}
        tag={randomDestination}
        properties={properties || []}
        isLoading={isLoading}
      />
    ) : null,
    typesSections: randomTypes.map((tag) => (
      <SegmentSection
        key={tag}
        title={tag}
        tag={tag}
        properties={properties || []}
        isLoading={isLoading}
      />
    )),
    // All segment sections for banner navigation
    allSegmentSections,
    // Expose properties and loading state for dynamic segment rendering
    properties: properties || [],
    isLoading,
  };
}
