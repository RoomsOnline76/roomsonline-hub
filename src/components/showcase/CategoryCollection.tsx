import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { staggerRunway, roomCardStrut } from '@/lib/motion';
import { FormattedPrice } from '@/components/FormattedPrice';
import { Bed, Users, Maximize, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  getNextAvailableDay?: (room: RoomData) => { date: string; dayName: string; units: number } | undefined;
  onRoomClick: (room: RoomData) => void;
  propertyImages?: string[];
  unitLabel?: string;
  unitLabelPlural?: string;
}

function extractCategory(name: string): string {
  const cleaned = name.replace(/^[A-Za-z]+\s*\d+\s*/i, '').trim();
  if (cleaned.length > 0 && cleaned !== name) {
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
    if (!categoryMap.has(category)) categoryMap.set(category, []);
    categoryMap.get(category)!.push(room);
  }

  const categories: RoomCategory[] = [];
  for (const [name, categoryRooms] of categoryMap) {
    const rates = categoryRooms.map(r => getLowestRate(r)).filter((r): r is number => r !== null);
    const sizes = categoryRooms.map(r => r.roomSize).filter((s): s is number => !!s);
    const guests = categoryRooms.map(r => r.maxPeople || r.maxAdults || 0);
    const allImages: string[] = [];
    let representativeImage: string | null = null;
    for (const room of categoryRooms) {
      if (room.images && room.images.length > 0) {
        if (!representativeImage) representativeImage = room.images[0];
        allImages.push(...room.images);
      }
    }
    if (!representativeImage && propertyImages.length > 0) representativeImage = propertyImages[0];

    categories.push({
      name, displayName: name, rooms: categoryRooms, count: categoryRooms.length,
      minRate: rates.length > 0 ? Math.min(...rates) : null,
      maxRate: rates.length > 0 ? Math.max(...rates) : null,
      minSize: sizes.length > 0 ? Math.min(...sizes) : null,
      maxSize: sizes.length > 0 ? Math.max(...sizes) : null,
      maxGuests: Math.max(...guests, 0),
      representativeImage, allImages: [...new Set(allImages)],
    });
  }

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

  const getCategoryAvailability = (category: RoomCategory): number | undefined => {
    let total = 0;
    let hasData = false;
    for (const room of category.rooms) {
      const avail = getAvailability(room);
      if (avail !== undefined) { hasData = true; total += avail; }
    }
    return hasData ? total : undefined;
  };

  if (rooms.length === 0) {
    return (
      <section className="py-12 px-6 sm:px-10">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-serif text-2xl font-light mb-4">Accommodations</h2>
          <p className="text-muted-foreground">Contact us to discover the perfect {unitLabel}.</p>
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} className="py-10 sm:py-14" id="rooms-section">
      <div className="max-w-full">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h2 className="font-serif text-xl sm:text-2xl font-light tracking-tight">
            {categories.length === 1 ? categories[0].displayName : `${categories.length} Apartment Types`}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {rooms.length} {rooms.length === 1 ? unitLabel : unitLabelPlural} available
          </p>
        </div>

        {/* Category cards - horizontal layout like room cards */}
        <motion.div
          initial="initial"
          animate={isVisible ? 'animate' : 'initial'}
          variants={staggerRunway}
          className="space-y-4"
        >
          {categories.map((category) => {
            const availability = getCategoryAvailability(category);
            const isUnavailable = availability !== undefined && availability <= 0;

            return (
              <motion.article
                key={category.name}
                variants={roomCardStrut}
                className={cn(
                  'group rounded-xl border border-border/50 bg-card overflow-hidden',
                  'hover:border-primary/30 hover:shadow-md transition-all duration-300',
                  'flex flex-col sm:flex-row',
                  isUnavailable && 'opacity-50 pointer-events-none'
                )}
                onClick={() => {
                  const availableRoom = category.rooms.find(r => {
                    const a = getAvailability(r);
                    return a === undefined || a > 0;
                  }) || category.rooms[0];
                  onRoomClick(availableRoom);
                }}
                role="button"
                tabIndex={isUnavailable ? -1 : 0}
              >
                {/* Image */}
                <div className="relative sm:w-[220px] lg:w-[260px] shrink-0">
                  <div className="aspect-[4/3] sm:aspect-auto sm:h-full overflow-hidden">
                    {category.representativeImage ? (
                      <img
                        src={category.representativeImage}
                        alt={category.displayName}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center min-h-[160px]">
                        <Bed className="h-10 w-10 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>

                  {/* Unit count badge */}
                  <div className="absolute top-3 left-3">
                    <span className="px-2.5 py-1 text-xs font-medium bg-background/90 backdrop-blur-sm rounded-full">
                      {category.count} {category.count === 1 ? unitLabel : unitLabelPlural}
                    </span>
                  </div>

                  {/* Availability warning */}
                  {availability !== undefined && availability > 0 && availability <= 3 && (
                    <div className="absolute top-3 right-3">
                      <span className="px-2 py-1 text-xs font-medium bg-destructive/90 text-destructive-foreground rounded-full">
                        {availability} left
                      </span>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 p-4 sm:p-5 flex flex-col justify-between min-w-0">
                  <div>
                    <h3 className="font-serif text-lg font-light tracking-tight mb-2 group-hover:text-primary transition-colors">
                      {category.displayName}
                    </h3>

                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        <span>Up to {category.maxGuests}</span>
                      </div>
                      {category.minSize && (
                        <div className="flex items-center gap-1">
                          <Maximize className="h-3.5 w-3.5" />
                          <span>
                            {category.minSize === category.maxSize
                              ? `${category.minSize}m²`
                              : `${category.minSize}–${category.maxSize}m²`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Price + CTA */}
                  <div className="flex items-end justify-between mt-3 pt-3 border-t border-border/30">
                    {category.minRate !== null ? (
                      <div>
                        <span className="text-xs text-muted-foreground">From </span>
                        <span className="text-lg font-semibold text-foreground">
                          <FormattedPrice amount={category.minRate} />
                        </span>
                        <span className="text-xs text-muted-foreground"> /night</span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Contact for rates</span>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1 group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-colors"
                    >
                      View {unitLabelPlural}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
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
