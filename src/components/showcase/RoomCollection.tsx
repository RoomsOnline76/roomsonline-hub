import { motion } from 'framer-motion';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { staggerRunway, roomCardStrut } from '@/lib/motion';
import { FormattedPrice } from '@/components/FormattedPrice';
import { formatRoomCapacity } from '@/lib/editorialUtils';
import { Bed, Users } from 'lucide-react';
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

interface RoomCollectionProps {
  rooms: RoomData[];
  getLowestRate: (room: RoomData) => number | null;
  getAvailability: (room: RoomData) => number | undefined;
  onRoomClick: (room: RoomData) => void;
  propertyImages?: string[];
  unitLabel?: string;
  unitLabelPlural?: string;
}

/**
 * Act III: The Collection
 * Asymmetrical masonry grid with staggered scroll-reveal
 */
export function RoomCollection({
  rooms,
  getLowestRate,
  getAvailability,
  onRoomClick,
  propertyImages = [],
  unitLabel = 'room',
  unitLabelPlural = 'rooms',
}: RoomCollectionProps) {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.1 });

  if (rooms.length === 0) {
    return (
      <section className="runway-section-spacing px-6 sm:px-10 md:px-16 lg:px-20">
        <div className="max-w-4xl mx-auto text-center">
          <span className="runway-section">Accommodations</span>
          <h2 className="runway-room-name mt-4 mb-6">Bespoke {unitLabelPlural.charAt(0).toUpperCase() + unitLabelPlural.slice(1)} Await</h2>
          <p className="runway-facts">
            Contact us to discover the perfect {unitLabel} for your journey.
          </p>
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
            {rooms.length === 1 
              ? `Your ${unitLabel.charAt(0).toUpperCase() + unitLabel.slice(1)}` 
              : `${rooms.length} Distinct ${unitLabelPlural.charAt(0).toUpperCase() + unitLabelPlural.slice(1)}`}
          </h2>
        </div>

        {/* Asymmetric Grid */}
        <motion.div
          initial="initial"
          animate={isVisible ? "animate" : "initial"}
          variants={staggerRunway}
          className="runway-grid"
        >
          {rooms.map((room, index) => {
            const rate = getLowestRate(room);
            const availability = getAvailability(room);
            const roomImages = room.images && room.images.length > 0 
              ? room.images 
              : propertyImages;
            const heroImage = roomImages[0];
            const isUnavailable = availability !== undefined && availability <= 0;
            const capacityText = formatRoomCapacity(room.maxPeople, room.maxAdults);

            return (
              <motion.article
                key={room.id}
                variants={roomCardStrut}
                className={cn(
                  "runway-card group cursor-pointer",
                  isUnavailable && "opacity-60 pointer-events-none",
                  // Create asymmetry - first card spans full on mobile
                  index === 0 && rooms.length > 2 && "md:col-span-2 lg:col-span-1"
                )}
                onClick={() => !isUnavailable && onRoomClick(room)}
                role="button"
                tabIndex={isUnavailable ? -1 : 0}
                aria-label={`View ${room.name}`}
              >
                {/* Image */}
                <div className="runway-image aspect-[4/3] sm:aspect-[16/10]">
                  {heroImage ? (
                    <img
                      src={heroImage}
                      alt={room.name}
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <Bed className="h-12 w-12 text-muted-foreground/30" />
                    </div>
                  )}
                  
                  {/* Availability Badge */}
                  {availability !== undefined && availability > 0 && availability <= 3 && (
                    <div className="absolute top-3 right-3">
                      <span className="px-2 py-1 text-xs font-medium bg-background/90 backdrop-blur-sm rounded-full">
                        {availability} {availability === 1 ? unitLabel : unitLabelPlural} left
                      </span>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-5 sm:p-6">
                  <h3 className="runway-room-name mb-2 group-hover:text-primary transition-colors">
                    {room.name}
                  </h3>

                  {/* Capacity as Prose */}
                  {capacityText && (
                    <p className="runway-facts text-sm mb-3">
                      {capacityText}
                    </p>
                  )}

                  {/* Description snippet */}
                  {room.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                      {room.description}
                    </p>
                  )}

                  {/* Price */}
                  <div className="flex items-end justify-between pt-3 border-t border-border/30">
                    {rate !== null ? (
                      <div>
                        <span className="text-xs text-muted-foreground uppercase">From</span>
                        <div className="runway-price-large">
                          <FormattedPrice amount={rate} />
                        </div>
                        <span className="text-xs text-muted-foreground">per night</span>
                      </div>
                    ) : (
                      <span className="runway-facts">Contact for rates</span>
                    )}

                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span className="text-sm">{room.maxPeople || room.maxAdults || '—'}</span>
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
