import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { staggerRunway, roomCardStrut } from '@/lib/motion';
import { FormattedPrice } from '@/components/FormattedPrice';
import { Bed, Users, Maximize, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RoomData {
  id: string;
  name: string;
  description?: string;
  images?: string[];
  maxPeople?: number;
  maxAdults?: number;
  bedConfiguration?: string | { type: string; count: number }[];
  roomSize?: number;
  bathrooms?: number;
}

interface RoomCategory {
  name: string;
  displayName: string;
  rooms: RoomData[];
  count: number;
  minRate: number | null;
  maxRate: number | null;
  minSize: number | null;
  maxSize: number | null;
  maxGuests: number;
  representativeImage: string | null;
  allImages: string[];
}

interface CategoryCollectionProps {
  rooms: RoomData[];
  getLowestRate: (room: RoomData) => number | null;
  getAvailability: (room: RoomData) => number | undefined;
  onRoomClick: (room: RoomData) => void;
  propertyImages?: string[];
  unitLabel?: string;
  unitLabelPlural?: string;
}

/**
 * Extract category from Hostfully unit name
 * "SixOnN 104 Compact Studio" → "Compact Studio"
 * "SixOnN 401 Two bedroom" → "Two Bedroom"
 * "Full Property" → "Full Property"
 */
function extractCategory(name: string): string {
  // Remove building prefix and unit number: "SixOnN 104 " or "SIXONN 208 "
  const cleaned = name.replace(/^[A-Za-z]+\s*\d+\s*/i, '').trim();
  if (cleaned.length > 0 && cleaned !== name) {
    // Capitalize first letter of each word
    return cleaned.replace(/\b\w/g, c => c.toUpperCase());
  }
  return name;
}

function groupRoomsByCategory(
  rooms: RoomData[],
  getLowestRate: (room: RoomData) => number | null,
  propertyImages: string[]
): RoomCategory[] {
  const categoryMap = new Map<string, RoomData[]>();

  for (const room of rooms) {
    const category = extractCategory(room.name);
    if (!categoryMap.has(category)) {
      categoryMap.set(category, []);
    }
    categoryMap.get(category)!.push(room);
  }

  const categories: RoomCategory[] = [];

  for (const [name, categoryRooms] of categoryMap) {
    const rates = categoryRooms.map(r => getLowestRate(r)).filter((r): r is number => r !== null);
    const sizes = categoryRooms.map(r => r.roomSize).filter((s): s is number => !!s);
    const guests = categoryRooms.map(r => r.maxPeople || r.maxAdults || 0);
    
    // Collect all images from rooms in this category
    const allImages: string[] = [];
    let representativeImage: string | null = null;
    for (const room of categoryRooms) {
      if (room.images && room.images.length > 0) {
        if (!representativeImage) representativeImage = room.images[0];
        allImages.push(...room.images);
      }
    }
    if (!representativeImage && propertyImages.length > 0) {
      representativeImage = propertyImages[0];
    }

    categories.push({
      name,
      displayName: name,
      rooms: categoryRooms,
      count: categoryRooms.length,
      minRate: rates.length > 0 ? Math.min(...rates) : null,
      maxRate: rates.length > 0 ? Math.max(...rates) : null,
      minSize: sizes.length > 0 ? Math.min(...sizes) : null,
      maxSize: sizes.length > 0 ? Math.max(...sizes) : null,
      maxGuests: Math.max(...guests, 0),
      representativeImage,
      allImages: [...new Set(allImages)],
    });
  }

  // Sort: Studios first, then by bedroom count, then alphabetically
  const sortOrder = ['compact studio', 'studio', 'one bedroom', 'two bedroom', 'three bedroom'];
  categories.sort((a, b) => {
    const aIdx = sortOrder.findIndex(s => a.name.toLowerCase().includes(s));
    const bIdx = sortOrder.findIndex(s => b.name.toLowerCase().includes(s));
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.name.localeCompare(b.name);
  });

  return categories;
}

export function CategoryCollection({
  rooms,
  getLowestRate,
  getAvailability,
  onRoomClick,
  propertyImages = [],
  unitLabel = 'unit',
  unitLabelPlural = 'units',
}: CategoryCollectionProps) {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.1 });

  const categories = useMemo(
    () => groupRoomsByCategory(rooms, getLowestRate, propertyImages),
    [rooms, getLowestRate, propertyImages]
  );

  // Calculate total availability per category
  const getCategoryAvailability = (category: RoomCategory): number | undefined => {
    let total = 0;
    let hasData = false;
    for (const room of category.rooms) {
      const avail = getAvailability(room);
      if (avail !== undefined) {
        hasData = true;
        total += avail;
      }
    }
    return hasData ? total : undefined;
  };

  if (rooms.length === 0) {
    return (
      <section className="runway-section-spacing px-6 sm:px-10 md:px-16 lg:px-20">
        <div className="max-w-4xl mx-auto text-center">
          <span className="runway-section">Accommodations</span>
          <h2 className="runway-room-name mt-4 mb-6">
            Bespoke {unitLabelPlural.charAt(0).toUpperCase() + unitLabelPlural.slice(1)} Await
          </h2>
          <p className="runway-facts">Contact us to discover the perfect {unitLabel} for your journey.</p>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={ref}
      className="runway-section-spacing px-6 sm:px-10 md:px-16 lg:px-20"
      id="rooms-section"
    >
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-10 sm:mb-14">
          <span className="runway-section">The Collection</span>
          <h2 className="runway-room-name mt-3">
            {categories.length === 1
              ? categories[0].displayName
              : `${categories.length} Apartment Types`}
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            {rooms.length} {rooms.length === 1 ? unitLabel : unitLabelPlural} across {categories.length} {categories.length === 1 ? 'category' : 'categories'}
          </p>
        </div>

        {/* Category Cards */}
        <motion.div
          initial="initial"
          animate={isVisible ? 'animate' : 'initial'}
          variants={staggerRunway}
          className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8"
        >
          {categories.map((category) => {
            const availability = getCategoryAvailability(category);
            const isUnavailable = availability !== undefined && availability <= 0;

            return (
              <motion.article
                key={category.name}
                variants={roomCardStrut}
                className={cn(
                  'runway-card group cursor-pointer overflow-hidden',
                  isUnavailable && 'opacity-60 pointer-events-none'
                )}
                onClick={() => {
                  // Click the first available room in this category
                  const availableRoom = category.rooms.find(r => {
                    const a = getAvailability(r);
                    return a === undefined || a > 0;
                  }) || category.rooms[0];
                  onRoomClick(availableRoom);
                }}
                role="button"
                tabIndex={isUnavailable ? -1 : 0}
                aria-label={`View ${category.displayName} apartments`}
              >
                {/* Image with gradient overlay */}
                <div className="relative aspect-[16/10] overflow-hidden">
                  {category.representativeImage ? (
                    <img
                      src={category.representativeImage}
                      alt={category.displayName}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <Bed className="h-12 w-12 text-muted-foreground/30" />
                    </div>
                  )}
                  
                  {/* Gradient overlay for text readability */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                  
                  {/* Category badge */}
                  <div className="absolute top-4 left-4">
                    <span className="px-3 py-1.5 text-xs font-medium bg-background/90 backdrop-blur-sm rounded-full">
                      {category.count} {category.count === 1 ? unitLabel : unitLabelPlural}
                    </span>
                  </div>

                  {/* Availability warning */}
                  {availability !== undefined && availability > 0 && availability <= 3 && (
                    <div className="absolute top-4 right-4">
                      <span className="px-2 py-1 text-xs font-medium bg-destructive/90 text-destructive-foreground backdrop-blur-sm rounded-full">
                        Only {availability} left
                      </span>
                    </div>
                  )}

                  {/* Bottom overlay content */}
                  <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6">
                    <h3 className="text-xl sm:text-2xl font-serif font-light text-white mb-1">
                      {category.displayName}
                    </h3>
                  </div>
                </div>

                {/* Details */}
                <div className="p-5 sm:p-6 space-y-4">
                  {/* Quick stats row */}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Users className="h-4 w-4" />
                      <span>Up to {category.maxGuests} guests</span>
                    </div>
                    {category.minSize && (
                      <div className="flex items-center gap-1.5">
                        <Maximize className="h-4 w-4" />
                        <span>
                          {category.minSize === category.maxSize
                            ? `${category.minSize}m²`
                            : `${category.minSize}–${category.maxSize}m²`}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Price and CTA row */}
                  <div className="flex items-end justify-between pt-3 border-t border-border/30">
                    {category.minRate !== null ? (
                      <div>
                        <span className="text-xs text-muted-foreground uppercase tracking-wider">From</span>
                        <div className="text-xl font-serif font-light">
                          <FormattedPrice amount={category.minRate} />
                        </div>
                        <span className="text-xs text-muted-foreground">per night</span>
                      </div>
                    ) : (
                      <span className="runway-facts">Contact for rates</span>
                    )}

                    <div className="flex items-center gap-1 text-sm text-primary group-hover:gap-2 transition-all">
                      <span>View {unitLabelPlural}</span>
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
