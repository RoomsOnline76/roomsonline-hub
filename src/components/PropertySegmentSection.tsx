import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PropertyCard } from "@/components/PropertyCard";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  SegmentFilterId, 
  SEGMENT_FILTERS, 
  filterPropertiesBySegment 
} from "@/lib/segmentFilters";

interface PropertySegmentSectionProps {
  segmentId: SegmentFilterId;
  title?: string;
  limit?: number;
  showCautionBadge?: boolean;
}

export function PropertySegmentSection({ 
  segmentId, 
  title, 
  limit,
  showCautionBadge = false
}: PropertySegmentSectionProps) {
  const segmentConfig = SEGMENT_FILTERS[segmentId];
  const sectionTitle = title || segmentConfig?.label || "Properties";
  const segmentTags = segmentConfig?.tags || [];

  const { data: properties, isLoading } = useQuery({
    queryKey: ["properties-segment", segmentId],
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
      return data || [];
    },
  });

  const filteredProperties = filterPropertiesBySegment(properties || [], segmentId);
  const displayProperties = limit ? filteredProperties.slice(0, limit) : filteredProperties;

  // Don't render section if no properties match
  if (!isLoading && displayProperties.length === 0) {
    return null;
  }

  return (
    <section className="py-8 sm:py-12">
      <div className="container mx-auto px-3 sm:px-4">
        {/* Section Header */}
        <div className="mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground inline">
            {sectionTitle}
          </h2>
          {segmentTags.length > 0 && (
            <span className="ml-3 text-xs sm:text-sm text-muted-foreground">
              TAGS: {segmentTags.join(", ")}
            </span>
          )}
        </div>

        {/* Loading State */}
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

        {/* Properties Grid */}
        {!isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {displayProperties.map((property) => (
              <PropertyCard key={property.id} property={property} showCautionBadge={showCautionBadge} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
