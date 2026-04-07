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
          editorial_rating, navigation_tags, external_system,
          why_we_chose_this_place, who_this_suits, 
          what_its_really_like, why_this_place_matters, who_its_not_for
        `)
        .eq("is_active", true)
        .eq("show_on_website", true)
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
    <section className="py-10 sm:py-14">
      <div className="container mx-auto px-4 sm:px-6">
        {/* Section Header */}
        <div className="mb-8">
          <h2 className="font-display text-2xl sm:text-3xl font-light text-foreground">
            {sectionTitle}
          </h2>
          {segmentTags.length > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              {segmentTags.join(" · ")}
            </p>
          )}
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-[4/3] w-full rounded-lg" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-16 w-full" />
              </div>
            ))}
          </div>
        )}

        {/* Properties Grid */}
        {!isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {displayProperties.map((property) => (
              <PropertyCard key={property.id} property={property} showCautionBadge={showCautionBadge} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
