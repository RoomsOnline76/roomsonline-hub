import { useState } from 'react';
import { motion } from 'framer-motion';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { sectionReveal } from '@/lib/motion';
import {
  Wifi, Tv, Wind, Coffee, UtensilsCrossed, ShowerHead,
  Car, Dumbbell, Waves, Mountain, Flame, Book, Dog,
  Shirt, Snowflake, Sun, Umbrella, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProseFacilitiesProps {
  facilities: string[];
}

const AMENITY_ICON_MAP: Record<string, any> = {
  wifi: Wifi, 'wi-fi': Wifi, internet: Wifi,
  tv: Tv, television: Tv,
  'air conditioning': Wind, 'air-conditioning': Wind, ac: Wind, aircon: Wind,
  coffee: Coffee, espresso: Coffee,
  kitchen: UtensilsCrossed, kitchenette: UtensilsCrossed, cooking: UtensilsCrossed,
  shower: ShowerHead, bathroom: ShowerHead,
  parking: Car, garage: Car,
  gym: Dumbbell, fitness: Dumbbell,
  pool: Waves, swimming: Waves,
  view: Mountain, 'sea view': Mountain, 'mountain view': Mountain,
  fireplace: Flame, 'fire pit': Flame,
  library: Book, books: Book,
  'pet friendly': Dog, pets: Dog,
  laundry: Shirt, washer: Shirt, dryer: Shirt,
  heating: Snowflake,
  balcony: Sun, terrace: Sun, patio: Sun, deck: Sun,
  bbq: Umbrella, braai: Umbrella, grill: Umbrella,
};

function getAmenityIcon(facility: string) {
  const lower = facility.toLowerCase();
  for (const [key, Icon] of Object.entries(AMENITY_ICON_MAP)) {
    if (lower.includes(key)) return Icon;
  }
  return Check;
}

/**
 * FluentLiving-style amenity grid with icon + label and "Show all" expand
 */
export function ProseFacilities({ facilities }: ProseFacilitiesProps) {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.3 });
  const [showAll, setShowAll] = useState(false);

  if (!facilities || facilities.length === 0) return null;

  const INITIAL_COUNT = 10;
  const displayedFacilities = showAll ? facilities : facilities.slice(0, INITIAL_COUNT);
  const hasMore = facilities.length > INITIAL_COUNT;

  return (
    <section
      ref={ref}
      className="px-6 sm:px-10 md:px-16 lg:px-20 py-8 md:py-10"
    >
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial="initial"
          animate={isVisible ? 'animate' : 'initial'}
          variants={sectionReveal}
        >
          <h2 className="text-lg font-semibold text-foreground mb-5">What this place offers</h2>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
            {displayedFacilities.map((facility, index) => {
              const Icon = getAmenityIcon(facility);
              return (
                <div
                  key={index}
                  className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0"
                >
                  <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                  <span className="text-sm text-foreground">{facility}</span>
                </div>
              );
            })}
          </div>

          {hasMore && !showAll && (
            <Button
              variant="outline"
              onClick={() => setShowAll(true)}
              className="mt-5 rounded-lg"
            >
              Show all {facilities.length} amenities
            </Button>
          )}
        </motion.div>
      </div>
    </section>
  );
}
