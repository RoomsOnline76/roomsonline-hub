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
 * Fluent-inspired room cards: clean horizontal layout
 * Image left, details right, "Select" button
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
      <section className="py-12 px-6 sm:px-10">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-serif text-2xl font-light mb-4">
            Accommodations
          </h2>
          <p className="text-muted-foreground">
            Contact us to discover the perfect {unitLabel} for your stay.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={ref}
      className="py-10 sm:py-14"
      id="rooms-section"
    >
      <div className="max-w-full">
        {/* Section Header */}
        <div className="mb-6 sm:mb-8">
          <h2 className="font-serif text-xl sm:text-2xl font-light tracking-tight">
            {rooms.length === 1
              ? `Your ${unitLabel.charAt(0).toUpperCase() + unitLabel.slice(1)}`
              : `Choose Your ${unitLabel.charAt(0).toUpperCase() + unitLabel.slice(1)}`}
          </h2>
          {rooms.length > 1 && (
            <p className="text-sm text-muted-foreground mt-1">
              {rooms.length} {unitLabelPlural} available
            </p>
          )}
        </div>

        {/* Room Cards - stacked vertically */}
        <motion.div
          initial="initial"
          animate={isVisible ? 'animate' : 'initial'}
          variants={staggerRunway}
          className="space-y-4"
        >
          {rooms.map((room) => {
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
                  "group rounded-xl border border-border/50 bg-card overflow-hidden",
                  "hover:border-primary/30 hover:shadow-md transition-all duration-300",
                  "flex flex-col sm:flex-row",
                  isUnavailable && "opacity-50 pointer-events-none",
                )}
              >
                {/* Image */}
                <div className="relative sm:w-[220px] lg:w-[260px] shrink-0">
                  <div className="aspect-[4/3] sm:aspect-auto sm:h-full overflow-hidden">
                    {heroImage ? (
                      <img
                        src={heroImage}
                        alt={room.name}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center min-h-[160px]">
                        <Bed className="h-10 w-10 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>

                  {/* Availability badge */}
                  {availability !== undefined && availability > 0 && availability <= 3 && (
                    <div className="absolute top-3 left-3">
                      <span className="px-2 py-1 text-xs font-medium bg-destructive/90 text-destructive-foreground rounded-full">
                        {availability} left
                      </span>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 p-4 sm:p-5 flex flex-col justify-between min-w-0">
                  <div>
                    <h3 className="font-serif text-lg font-light tracking-tight mb-1.5 group-hover:text-primary transition-colors">
                      {room.name}
                    </h3>

                    {/* Capacity */}
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mb-2">
                      {capacityText && (
                        <div className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          <span>{capacityText}</span>
                        </div>
                      )}
                      {room.roomSize && (
                        <span>{room.roomSize}m²</span>
                      )}
                    </div>

                    {/* Description */}
                    {room.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {room.description}
                      </p>
                    )}
                  </div>

                  {/* Price + action row */}
                  <div className="flex items-end justify-between mt-3 pt-3 border-t border-border/30">
                    {rate !== null ? (
                      <div>
                        <span className="text-xs text-muted-foreground">From </span>
                        <span className="text-lg font-semibold text-foreground">
                          <FormattedPrice amount={rate} />
                        </span>
                        <span className="text-xs text-muted-foreground"> /night</span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Contact for rates</span>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRoomClick(room);
                      }}
                      className="shrink-0 gap-1 group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-colors"
                    >
                      Select
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
