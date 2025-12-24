// Map filter configuration based on navigation tags
// Categories and their associated filters for the property map

export type MapFilterCategoryId = 'destination' | 'vibe' | 'escape' | 'user_profile';

export interface MapFilterCategory {
  id: MapFilterCategoryId;
  label: string;
}

export interface MapFilter {
  id: string;
  category: MapFilterCategoryId;
  label: string;
  tags: readonly string[];
}

export const MAP_FILTER_CATEGORIES: readonly MapFilterCategory[] = [
  { id: 'destination', label: 'Destination' },
  { id: 'vibe', label: 'Vibe' },
  { id: 'escape', label: 'Escape' },
  { id: 'user_profile', label: 'User Profile' },
] as const;

export const MAP_FILTERS: readonly MapFilter[] = [
  // Destination
  { id: 'destination_city', category: 'destination', label: 'City', tags: ['City', 'Urban Icon', 'Central But Calm'] },
  { id: 'destination_beach', category: 'destination', label: 'Beach & Coast', tags: ['Beach', 'Barefoot Luxury', "Couples' Playground"] },
  { id: 'destination_mountain', category: 'destination', label: 'Mountain & Wilderness', tags: ['Mountain', 'Nature Immersion', 'Landscape-Led', 'Epic'] },
  { id: 'destination_countryside', category: 'destination', label: 'Countryside & Rural', tags: ['Country Side', 'Rustic Chic', 'Secluded Escape'] },
  { id: 'destination_arts', category: 'destination', label: 'Arts & Culture Capital', tags: ['Arts & Culture', 'Bohemian', 'Design Mecca'] },
  { id: 'destination_food', category: 'destination', label: 'Food & Wine Region', tags: ['Gastronomy', 'Foodie Pilgrimage'] },
  
  // Vibe
  { id: 'vibe_buzzing', category: 'vibe', label: 'Buzzing & High-Energy', tags: ['Buzzing', 'Viral-Worthy', 'Urban Icon'] },
  { id: 'vibe_tranquil', category: 'vibe', label: 'Tranquil & Serene', tags: ['Oasis Of Calm', 'Secluded', 'Well-Being'] },
  { id: 'vibe_design', category: 'vibe', label: 'Design-Forward & Stylish', tags: ['Design-Forward', 'Interior Design', 'Design Mecca'] },
  { id: 'vibe_rustic', category: 'vibe', label: 'Rustic & Authentic', tags: ['Rustic Chic', 'Country Side', 'Offbeat'] },
  { id: 'vibe_glamorous', category: 'vibe', label: 'Glamorous & Luxe', tags: ['Glamorous', 'Wow-Factor', 'Barefoot Luxury'] },
  
  // Escape
  { id: 'escape_romantic', category: 'escape', label: 'Romantic & Couples', tags: ['Honeymoon', "Couples' Playground", 'Adults Only'] },
  { id: 'escape_adventure', category: 'escape', label: 'Adventure & Thrills', tags: ['Epic', 'Adventure Frontier', 'Dramatic'] },
  { id: 'escape_wellbeing', category: 'escape', label: 'Well-Being & Rejuvenation', tags: ['Well-Being', 'Transformative', 'Oasis Of Calm'] },
  { id: 'escape_nature', category: 'escape', label: 'Nature Immersion', tags: ['Nature Immersion', 'Off-The-Grid', 'Landscape-Led'] },
  { id: 'escape_cultural', category: 'escape', label: 'Cultural Immersion', tags: ['Arts & Culture', 'History', 'Bohemian'] },
  
  // User Profile
  { id: 'profile_honeymooners', category: 'user_profile', label: 'Honeymooners', tags: ['Honeymoon', 'Romantic', 'Adults Only', 'Wow-Factor'] },
  { id: 'profile_adventure', category: 'user_profile', label: 'Adventure & Friends', tags: ['Adventure Frontier', 'Epic', 'Social & Festive'] },
  { id: 'profile_foodie', category: 'user_profile', label: 'Foodie Weekend', tags: ['Gastronomy', 'Foodie Pilgrimage', 'Urban Icon'] },
  { id: 'profile_family', category: 'user_profile', label: 'Family Holiday', tags: ['Family Friendly', 'Multi-Generational', 'Country Side'] },
  { id: 'profile_recharge', category: 'user_profile', label: 'Recharge', tags: ['Well-Being', 'Tranquil & Serene', 'Secluded Escape'] },
] as const;

// Type for property with navigation tags
export interface PropertyWithNavTags {
  navigation_tags?: string[] | null;
}

/**
 * Get filters grouped by category
 */
export function getMapFiltersByCategory(): Record<MapFilterCategoryId, MapFilter[]> {
  const grouped: Record<MapFilterCategoryId, MapFilter[]> = {
    destination: [],
    vibe: [],
    escape: [],
    user_profile: [],
  };

  MAP_FILTERS.forEach((filter) => {
    grouped[filter.category].push(filter);
  });

  return grouped;
}

/**
 * Filter properties by selected map filters
 * Returns properties that match ANY tag from the selected filter(s)
 */
export function filterPropertiesByMapFilters<T extends PropertyWithNavTags>(
  properties: T[],
  selectedFilterIds: string[]
): T[] {
  if (selectedFilterIds.length === 0) return properties;

  // Collect all tags from selected filters
  const selectedTags = new Set<string>();
  selectedFilterIds.forEach((filterId) => {
    const filter = MAP_FILTERS.find((f) => f.id === filterId);
    if (filter) {
      filter.tags.forEach((tag) => selectedTags.add(tag.toLowerCase()));
    }
  });

  if (selectedTags.size === 0) return properties;

  return properties.filter((property) => {
    const propTags = property.navigation_tags;
    if (!propTags || propTags.length === 0) return false;

    // Check if any property tag matches any selected tag (case-insensitive)
    return propTags.some((tag) => selectedTags.has(tag.toLowerCase()));
  });
}

/**
 * Get a flat list of all filter options for UI
 */
export function getMapFilterOptions(): MapFilter[] {
  return [...MAP_FILTERS];
}

/**
 * Get filter by ID
 */
export function getMapFilterById(filterId: string): MapFilter | undefined {
  return MAP_FILTERS.find((f) => f.id === filterId);
}
