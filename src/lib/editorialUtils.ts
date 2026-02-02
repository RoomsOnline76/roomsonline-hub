/**
 * Editorial Content Utilities
 * Paris Fashion Week Design System
 * 
 * Provides graceful degradation and prose composition for property showcases.
 * Rule: If data doesn't exist, the layout never admits it wanted it.
 */

interface PropertyData {
  name: string;
  description?: string | null;
  city: string;
  country: string;
  address?: string;
  max_guests: number;
  bedrooms?: number | null;
  bathrooms?: number | null;
  property_type: string;
  latitude?: number | null;
  longitude?: number | null;
  images?: string[];
  hero_video_url?: string | null;
  editorial_rating?: string | null;
  why_we_chose_this_place?: string | null;
  who_this_suits?: string | null;
  what_its_really_like?: string | null;
  why_this_place_matters?: string | null;
  who_its_not_for?: string | null;
  amenities?: any;
}

/**
 * Compose a poetic tagline from available property data
 */
export function composeTagline(property: PropertyData): string {
  // Priority 1: Editorial content
  if (property.what_its_really_like) {
    // Extract first sentence or phrase
    const firstLine = property.what_its_really_like.split(/[.!?]/)[0];
    if (firstLine && firstLine.length > 10 && firstLine.length < 100) {
      return firstLine.trim();
    }
  }

  // Priority 2: Property description first line
  if (property.description) {
    const firstLine = property.description.split(/[.!?]/)[0];
    if (firstLine && firstLine.length > 10 && firstLine.length < 100) {
      return firstLine.trim();
    }
  }

  // Priority 3: Location-based poetic fallback
  const locationPoems: Record<string, string> = {
    'South Africa': 'Where African horizons meet timeless luxury',
    'Cape Town': 'At the edge of two oceans',
    'Franschhoek': 'In the heart of wine country',
    'Stellenbosch': 'Where oak-lined streets meet vineyards',
    'Johannesburg': 'The pulse of Africa',
    'Durban': 'Where warm waters embrace golden shores',
  };

  if (locationPoems[property.city]) {
    return locationPoems[property.city];
  }
  if (locationPoems[property.country]) {
    return locationPoems[property.country];
  }

  // Priority 4: Property type based
  const typePoems: Record<string, string> = {
    hotel: 'A sanctuary of refined hospitality',
    guesthouse: 'Intimate moments, unforgettable stays',
    lodge: 'Where wilderness meets elegance',
    villa: 'Your private haven awaits',
    boutique: 'Distinctly curated for the discerning traveler',
  };

  const propertyType = property.property_type.toLowerCase().replace('_', ' ');
  for (const [key, poem] of Object.entries(typePoems)) {
    if (propertyType.includes(key)) {
      return poem;
    }
  }

  // Final fallback
  return 'An extraordinary escape';
}

/**
 * Get hero media (video or images) with fallbacks
 */
export function getHeroMedia(property: PropertyData): {
  type: 'video' | 'image' | 'gradient';
  src?: string;
  images?: string[];
  fallbackGradient?: string;
} {
  // Priority 1: Video
  if (property.hero_video_url) {
    return { type: 'video', src: property.hero_video_url };
  }

  // Priority 2: Images (normalize objects to strings if needed)
  if (property.images && property.images.length > 0) {
    const normalizedImages = property.images.map((img: any) => {
      // Handle both string URLs and image objects with url property (e.g., HotelBeds)
      if (typeof img === 'string') return img;
      if (img && typeof img === 'object' && img.url) return img.url;
      return null;
    }).filter((url: string | null): url is string => url !== null);

    if (normalizedImages.length > 0) {
      return { type: 'image', images: normalizedImages };
    }
  }

  // Priority 3: Abstract gradient using coordinates
  const fallbackGradient = generateGradientFromCoords(
    property.latitude,
    property.longitude
  );
  return { type: 'gradient', fallbackGradient };
}

/**
 * Generate a unique gradient based on latitude/longitude
 */
function generateGradientFromCoords(lat?: number | null, lng?: number | null): string {
  if (lat && lng) {
    // Use coordinates to generate unique hue values
    const hue1 = Math.abs((lat * 2) % 360);
    const hue2 = Math.abs((lng * 2) % 360);
    return `linear-gradient(135deg, hsl(${hue1}, 30%, 25%) 0%, hsl(${hue2}, 25%, 15%) 100%)`;
  }
  // Default sophisticated gradient
  return 'linear-gradient(135deg, hsl(220, 30%, 20%) 0%, hsl(220, 25%, 12%) 100%)';
}

/**
 * Compose prose-style facts ("A sanctuary for 12 overlooking Franschhoek")
 */
export function composeProseFacts(property: PropertyData): string[] {
  const facts: string[] = [];

  // Main sanctuary line
  if (property.max_guests > 0) {
    facts.push(`A sanctuary for ${property.max_guests} overlooking ${property.city}`);
  } else {
    facts.push(`A ${property.property_type.replace('_', ' ')} in ${property.city}`);
  }

  // Chambers and baths
  if (property.bedrooms && property.bathrooms) {
    const chamberWord = property.bedrooms === 1 ? 'private chamber' : 'private chambers';
    const bathWord = property.bathrooms === 1 ? 'bath' : 'baths';
    facts.push(`${property.bedrooms} ${chamberWord} with ${property.bathrooms} ${bathWord} await`);
  } else if (property.bedrooms) {
    const chamberWord = property.bedrooms === 1 ? 'bedroom' : 'bedrooms';
    facts.push(`${property.bedrooms} ${chamberWord} of refined comfort`);
  }

  return facts;
}

/**
 * Get editorial blurb cycling through ROL Spec fields
 */
export function getEditorialBlurb(property: PropertyData): {
  content: string;
  type: 'editorial' | 'description' | 'generated';
} | null {
  // Priority 1: Why we chose this place
  if (property.why_we_chose_this_place) {
    return { content: property.why_we_chose_this_place, type: 'editorial' };
  }

  // Priority 2: What it's really like
  if (property.what_its_really_like) {
    return { content: property.what_its_really_like, type: 'editorial' };
  }

  // Priority 3: Why this place matters
  if (property.why_this_place_matters) {
    return { content: property.why_this_place_matters, type: 'editorial' };
  }

  // Priority 4: Who this suits
  if (property.who_this_suits) {
    return { content: property.who_this_suits, type: 'editorial' };
  }

  // Priority 5: Standard description
  if (property.description) {
    return { content: property.description, type: 'description' };
  }

  return null;
}

/**
 * Compose amenities as flowing, intelligent prose
 * Creates natural sentences that properly describe the experience
 */
export function composeAmenitiesProse(facilities: string[]): string | null {
  if (!facilities || facilities.length === 0) return null;

  // Normalize and deduplicate amenities - treat synonyms as same concept
  const synonymGroups: Record<string, string[]> = {
    'gym': ['gym', 'fitness', 'fitness centre', 'fitness center', 'exercise room', 'workout'],
    'pool': ['pool', 'swimming pool', 'heated pool', 'outdoor pool', 'indoor pool'],
    'spa': ['spa', 'wellness centre', 'wellness center', 'treatments'],
    'restaurant': ['restaurant', 'dining room', 'on-site dining'],
    'bar': ['bar', 'lounge bar', 'cocktail bar', 'wine bar'],
    'breakfast': ['breakfast', 'breakfast included', 'complimentary breakfast', 'morning meal'],
    'garden': ['garden', 'gardens', 'landscaped grounds'],
    'terrace': ['terrace', 'patio', 'deck', 'outdoor seating'],
    'fireplace': ['fireplace', 'fire pit', 'wood fire'],
    'wifi': ['wifi', 'wi-fi', 'internet', 'free wifi'],
    'parking': ['parking', 'free parking', 'secure parking', 'garage'],
  };

  // Map facilities to canonical names and deduplicate
  const canonicalFacilities = new Set<string>();
  const unmapped: string[] = [];

  for (const facility of facilities) {
    const lower = facility.toLowerCase().trim();
    let found = false;
    
    for (const [canonical, synonyms] of Object.entries(synonymGroups)) {
      if (synonyms.some(syn => lower.includes(syn) || syn.includes(lower))) {
        canonicalFacilities.add(canonical);
        found = true;
        break;
      }
    }
    
    if (!found && facility.length > 2) {
      unmapped.push(facility);
    }
  }

  // Define how to describe each canonical amenity in prose
  const amenityPhrases: Record<string, string> = {
    'gym': 'the gym',
    'pool': 'the pool',
    'spa': 'the spa',
    'restaurant': 'on-site dining',
    'bar': 'the bar',
    'breakfast': 'included breakfast',
    'garden': 'tranquil gardens',
    'terrace': 'the terrace',
    'fireplace': 'a cosy fireplace',
    'wifi': 'complimentary WiFi',
    'parking': 'secure parking',
  };

  // Categorize canonical facilities
  const categories = {
    wellness: ['pool', 'spa', 'gym'].filter(a => canonicalFacilities.has(a)),
    dining: ['restaurant', 'bar', 'breakfast'].filter(a => canonicalFacilities.has(a)),
    comfort: ['garden', 'terrace', 'fireplace'].filter(a => canonicalFacilities.has(a)),
    convenience: ['wifi', 'parking'].filter(a => canonicalFacilities.has(a)),
  };

  const sentences: string[] = [];

  // Wellness sentence
  if (categories.wellness.length > 0) {
    const items = categories.wellness.map(a => amenityPhrases[a]);
    if (items.length === 1) {
      sentences.push(`Revive at ${items[0]}`);
    } else {
      const last = items.pop();
      sentences.push(`Revive at ${items.join(', ')} and ${last}`);
    }
  }

  // Dining sentence
  if (categories.dining.length > 0) {
    const items = categories.dining.map(a => amenityPhrases[a]);
    const hasBreakfast = categories.dining.includes('breakfast');
    const hasRestaurant = categories.dining.includes('restaurant');
    const hasBar = categories.dining.includes('bar');

    let diningPhrase = '';
    if (hasBreakfast && hasRestaurant && hasBar) {
      diningPhrase = 'breakfast, on-site dining, and evening drinks at the bar';
    } else if (hasBreakfast && hasRestaurant) {
      diningPhrase = 'breakfast and on-site dining';
    } else if (hasBreakfast && hasBar) {
      diningPhrase = 'breakfast and evening drinks at the bar';
    } else if (hasRestaurant && hasBar) {
      diningPhrase = 'on-site dining and drinks at the bar';
    } else if (hasBreakfast) {
      diningPhrase = 'a leisurely breakfast';
    } else if (hasRestaurant) {
      diningPhrase = 'on-site dining';
    } else if (hasBar) {
      diningPhrase = 'drinks at the bar';
    }

    if (diningPhrase) {
      const verb = sentences.length > 0 ? 'savour' : 'Savour';
      sentences.push(`${verb} ${diningPhrase}`);
    }
  }

  // Comfort sentence (only if we have room)
  if (categories.comfort.length > 0 && sentences.length < 2) {
    const items = categories.comfort.map(a => amenityPhrases[a]);
    if (items.length === 1) {
      sentences.push(`unwind by ${items[0]}`);
    } else {
      const last = items.pop();
      sentences.push(`unwind amid ${items.join(', ')} and ${last}`);
    }
  }

  // If nothing substantial, try convenience or unmapped
  if (sentences.length === 0) {
    if (categories.convenience.length > 0) {
      const items = categories.convenience.map(a => amenityPhrases[a]);
      return `Enjoy ${items.join(' and ')}.`;
    }
    if (unmapped.length > 0) {
      const listed = unmapped.slice(0, 3).map(a => a.toLowerCase()).join(', ');
      return `Featuring ${listed}.`;
    }
    return null;
  }

  // Join sentences naturally
  if (sentences.length === 1) {
    return sentences[0] + '.';
  }
  
  // Capitalize first, lowercase rest, join with commas
  const [first, ...rest] = sentences;
  return first + ', ' + rest.join(', ') + '.';
}

/**
 * Format room capacity as prose
 */
export function formatRoomCapacity(maxPeople?: number, maxAdults?: number, maxChildren?: number): string {
  if (!maxPeople && !maxAdults) return '';
  
  const guests = maxPeople || maxAdults || 0;
  if (guests === 1) return 'Sleeps 1';
  if (guests === 2) return 'Sleeps 2 in quiet luxury';
  if (guests <= 4) return `Accommodates ${guests} with ease`;
  return `Welcomes up to ${guests} guests`;
}

/**
 * Get editorial rating display
 */
export function getEditorialRatingDisplay(rating?: string | null): {
  label: string;
  description: string;
} | null {
  if (!rating) return null;

  const ratings: Record<string, { label: string; description: string }> = {
    exceptional: { label: 'Exceptional', description: 'Among the finest in its class' },
    excellent: { label: 'Excellent', description: 'Exceeds expectations at every turn' },
    outstanding: { label: 'Outstanding', description: 'A remarkable experience awaits' },
    remarkable: { label: 'Remarkable', description: 'Truly memorable' },
    noteworthy: { label: 'Noteworthy', description: 'Worth discovering' },
  };

  const normalized = rating.toLowerCase();
  return ratings[normalized] || { label: rating, description: '' };
}
