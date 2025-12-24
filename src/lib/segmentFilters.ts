/**
 * Segment Filter Configuration for ROL Navigation Tags
 * Maps segment categories to their corresponding navigation tags
 */

export const SEGMENT_FILTERS = {
  discover_new: { label: "Discover New", tags: ["New"] },
  city: { label: "City", tags: ["City"] },
  beach: { label: "Beach", tags: ["Beach"] },
  mountain: { label: "Mountain", tags: ["Mountain"] },
  countryside: { label: "Countryside", tags: ["Country Side"] },
  luxury_style: { 
    label: "Luxury | Style", 
    tags: ["Barefoot Luxury", "Rustic Chic", "Glamorous", "Design-Forward", "Interior Design", "Design Mecca", "Bohemian"] 
  },
  wow_epic: { 
    label: "WOW & Epic", 
    tags: ["Epic", "Wow-Factor", "Viral-Worthy", "Dramatic", "Bucket-List", "Landscape-Led"] 
  },
  seclusion_escape: { 
    label: "Seclusion | Escape", 
    tags: ["Secluded", "Secluded Escape", "Off-The-Grid", "Hidden Gem", "Uncharted", "Offbeat", "Oasis Of Calm"] 
  },
  romance: { label: "Romance", tags: ["Honeymoon", "Couples' Playground"] },
  wellness: { label: "Wellness", tags: ["Well-Being", "Transformative"] },
  gastronomy: { label: "Gastronomy", tags: ["Gastronomy", "Foodie Pilgrimage"] },
  sustainable: { label: "Sustainable", tags: ["Sustainable", "Eco-Conscious"] },
  history: { label: "History", tags: ["History"] },
  arts_culture: { label: "Arts & Culture", tags: ["Arts & Culture"] },
  family_friendly: { label: "Family Friendly", tags: ["Family Friendly", "Multi-Generational"] },
  adults_only: { label: "Adults Only", tags: ["Adults Only"] },
} as const;

export type SegmentFilterId = keyof typeof SEGMENT_FILTERS;

export interface PropertyWithTags {
  navigation_tags?: string[] | null;
  [key: string]: unknown;
}

/**
 * Filters properties by segment category based on navigation_tags
 * @param properties - Array of properties with navigation_tags
 * @param segmentId - The segment filter ID to apply (null returns all properties)
 * @returns Filtered array of properties matching the segment's tags
 */
export function filterPropertiesBySegment<T extends PropertyWithTags>(
  properties: T[],
  segmentId: SegmentFilterId | null
): T[] {
  if (!segmentId || !properties) return properties || [];
  
  const segment = SEGMENT_FILTERS[segmentId];
  if (!segment) return properties;
  
  const segmentTags: readonly string[] = segment.tags;
  
  return properties.filter(property => 
    property.navigation_tags?.some(tag => segmentTags.includes(tag))
  );
}

/**
 * Returns all segment filter options for building UI
 */
export function getSegmentFilterOptions(): Array<{ id: SegmentFilterId; label: string }> {
  return Object.entries(SEGMENT_FILTERS).map(([id, config]) => ({
    id: id as SegmentFilterId,
    label: config.label,
  }));
}

/**
 * Gets the tags for a specific segment
 */
export function getSegmentTags(segmentId: SegmentFilterId): readonly string[] {
  return SEGMENT_FILTERS[segmentId]?.tags || [];
}
