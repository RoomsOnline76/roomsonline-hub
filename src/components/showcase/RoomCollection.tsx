import { motion } from 'framer-motion';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { staggerRunway, roomCardStrut } from '@/lib/motion';
import { FormattedPrice } from '@/components/FormattedPrice';
import { Bed, Users, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatRoomCapacity } from '@/lib/editorialUtils';

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

interface NextAvailableDay {
  date: string;
  dayName: string;
  units: number;
}

interface RoomCollectionProps {
  rooms: RoomData[];
  getLowestRate: (room: RoomData) => number | null;
  getAvailability: (room: RoomData) => number | undefined;
  getNextAvailableDay?: (room: RoomData) => NextAvailableDay | undefined;
  onRoomClick: (room: RoomData) => void;
  propertyImages?: string[];
  unitLabel?: string;
  unitLabelPlural?: string;
}

/**
 * Fluent-inspired room cards: horizontal on desktop, stacked on mobile.
 * Thumb-friendly select button, compact layout for small screens.
 */
export function RoomCollection({
  rooms,
  getLowestRate,
  getAvailability,
  getNextAvailableDay,
  onRoomClick,
  propertyImages = [],
  unitLabel = 'room',
  unitLabelPlural = 'rooms',
}: RoomCollectionProps) {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.1 });

  if (rooms.length === 0) {
    return (
      <section className="py-10 sm:py-12 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-serif text-xl sm:text-2xl font-light mb-4">
            Accommodations
          </h2>
          <p className="text-muted-foreground text-sm">
            Contact us to discover the perfect {unitLabel} for your stay.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} className="py-8 sm:py-14" id="rooms-section">
      <div className="max-w-full">
        {/* Section Header */}
        <div className="mb-5 sm:mb-8">
          <h2 className="font-serif text-lg sm:text-2xl font-light tracking-tight">
            {rooms.length === 1
              ? `Your ${unitLabel.charAt(0).toUpperCase() + unitLabel.slice(1)}`
              : `Choose Your ${unitLabel.charAt(0).toUpperCase() + unitLabel.slice(1)}`}
          </h2>
          {rooms.length > 1 && (
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {rooms.length} {unitLabelPlural} available
            </p>
          )}
        </div>

        {/* Room Cards */}
        <motion.div
          initial="initial"
          animate={isVisible ? 'animate' : 'initial'}
          variants={staggerRunway}
          className="space-y-3 sm:space-y-4"
        >
          {rooms.map((room) => {
            const rate = getLowestRate(room);
            const availability = getAvailability(room);
            const roomImages = room.images && room.images.length > 0 ? room.images : propertyImages;
            const heroImage = roomImages[0];
            const isUnavailable = availability !== undefined && availability <= 0;
            const capacityText = formatRoomCapacity(room.maxPeople, room.maxAdults);

            return (
              <motion.article
                key={room.id}
                variants={roomCardStrut}
                className={cn(
                  "group rounded-xl border border-border/50 bg-card overflow-hidden",
                  "hover:border-primary/30 hover:shadow-md transition-all duration-300",
                  "flex flex-col sm:flex-row",
                  isUnavailable && "opacity-50 pointer-events-none",
                )}
              >
                {/* Image — taller aspect on mobile for visual impact */}
                <div className="relative sm:w-[200px] lg:w-[260px] shrink-0">
                  <div className="aspect-[16/9] sm:aspect-auto sm:h-full overflow-hidden">
                    {heroImage ? (
                      <img
                        src={heroImage}
                        alt={room.name}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center min-h-[140px] sm:min-h-[160px]">
                        <Bed className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>

                  {/* Availability badge */}
                  {availability !== undefined && availability > 0 && availability <= 3 && (
                    <div className="absolute top-2 left-2 sm:top-3 sm:left-3">
                      <span className="px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium bg-destructive/90 text-destructive-foreground rounded-full">
                        {availability} left
                      </span>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 p-3.5 sm:p-5 flex flex-col justify-between min-w-0">
                  <div>
                    <h3 className="font-serif text-base sm:text-lg font-light tracking-tight mb-1 group-hover:text-primary transition-colors">
                      {room.name}
                    </h3>

                    {/* Capacity */}
                    <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground mb-1.5 sm:mb-2">
                      {capacityText && (
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                          <span>{capacityText}</span>
                        </div>
                      )}
                      {room.roomSize && <span>{room.roomSize}m²</span>}
                    </div>

                    {/* Description — shorter clamp on mobile */}
                    {room.description && (
                      <p className="text-xs sm:text-sm text-muted-foreground line-clamp-1 sm:line-clamp-2">
                        {room.description}
                      </p>
                    )}
                  </div>

                  {/* Price + action row */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/30">
                    {rate !== null ? (
                      <div>
                        <span className="text-[10px] sm:text-xs text-muted-foreground">From </span>
                        <span className="text-base sm:text-lg font-semibold text-foreground">
                          <FormattedPrice amount={rate} />
                        </span>
                        <span className="text-[10px] sm:text-xs text-muted-foreground"> /night</span>
                      </div>
                    ) : (
                      <span className="text-xs sm:text-sm text-muted-foreground">Contact for rates</span>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRoomClick(room);
                      }}
                      className="shrink-0 gap-1 h-9 sm:h-8 px-4 sm:px-3 text-sm sm:text-xs group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-colors"
                    >
                      Select
                      <ChevronRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
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
