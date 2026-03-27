import { motion } from 'framer-motion';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { sectionReveal } from '@/lib/motion';
import { MapPin, Clock, Shield, Bed, Bath, Users, Star } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

interface BuildingIntroProps {
  description?: string | null;
  address?: string;
  city?: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  totalUnits?: number;
  bedrooms?: number;
  bathrooms?: number;
  maxGuests?: number;
  rating?: number | null;
  reviewCount?: number | null;
}

/**
 * Building introduction — FluentLiving-style horizontal facts strip + description
 */
export function BuildingIntro({
  description,
  address,
  city,
  checkInTime,
  checkOutTime,
  totalUnits,
  bedrooms,
  bathrooms,
  maxGuests,
  rating,
  reviewCount,
}: BuildingIntroProps) {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.3 });

  if (!description && !address) return null;

  const facts = [
    bedrooms && bedrooms > 0 && { icon: Bed, label: `${bedrooms} bedroom${bedrooms !== 1 ? 's' : ''}` },
    bathrooms && bathrooms > 0 && { icon: Bath, label: `${bathrooms} bathroom${bathrooms !== 1 ? 's' : ''}` },
    maxGuests && maxGuests > 0 && { icon: Users, label: `Up to ${maxGuests} guests` },
    totalUnits && totalUnits > 1 && { icon: Shield, label: `${totalUnits} apartments` },
  ].filter(Boolean) as { icon: any; label: string }[];

  return (
    <section
      ref={ref}
      className="px-6 sm:px-10 md:px-16 lg:px-20 py-6 md:py-8"
    >
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial="initial"
          animate={isVisible ? 'animate' : 'initial'}
          variants={sectionReveal}
          className="space-y-5"
        >
          {/* Horizontal facts strip */}
          {facts.length > 0 && (
            <div className="flex flex-wrap items-center gap-4 sm:gap-6 py-3 border-b border-border/50">
              {facts.map((fact, i) => (
                <div key={i} className="flex items-center gap-2 text-foreground">
                  <fact.icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{fact.label}</span>
                </div>
              ))}

              {/* Review badge */}
              {rating && rating > 0 && (
                <div className="flex items-center gap-1.5 ml-auto bg-primary/10 px-3 py-1.5 rounded-lg">
                  <Star className="h-4 w-4 text-primary fill-primary" />
                  <span className="text-sm font-semibold text-foreground">{rating.toFixed(1)}</span>
                  {reviewCount && reviewCount > 0 && (
                    <span className="text-xs text-muted-foreground">
                      · {reviewCount} review{reviewCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Check-in / check-out times */}
          {(checkInTime || (address && city)) && (
            <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-sm text-muted-foreground">
              {address && city && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span>{address}, {city}</span>
                </div>
              )}
              {checkInTime && (
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    Check-in {checkInTime}
                    {checkOutTime && ` · Check-out ${checkOutTime}`}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Description */}
          {description && (
            <>
              <Separator className="opacity-50" />
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-3">About this place</h2>
                <p className="text-muted-foreground leading-relaxed text-[15px]">
                  {description}
                </p>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </section>
  );
}
