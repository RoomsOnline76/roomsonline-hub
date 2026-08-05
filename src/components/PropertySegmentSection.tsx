import { PropertyCard } from "@/components/PropertyCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useShowcaseProperties } from "@/hooks/useShowcaseProperties";
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
  /** Number of leading cards to load eagerly (above-the-fold LCP candidates). */
  priorityImages?: number;
}

export function PropertySegmentSection({ 
  segmentId, 
  title, 
  limit,
  showCautionBadge = false,
  priorityImages = 0
}: PropertySegmentSectionProps) {
  const segmentConfig = SEGMENT_FILTERS[segmentId];
  const sectionTitle = title || segmentConfig?.label || "Properties";
  const segmentTags = segmentConfig?.tags || [];

  // Shared across every segment section — one request, cached.
  const { data: properties, isLoading } = useShowcaseProperties();


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
