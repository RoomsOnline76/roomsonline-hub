import { motion } from 'framer-motion';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { sectionReveal } from '@/lib/motion';
import { MapPin, Clock, Shield } from 'lucide-react';

interface BuildingIntroProps {
  description?: string | null;
  address?: string;
  city?: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  totalUnits?: number;
}

/**
 * Building introduction section with description and key details
 * Used for multi-unit Hostfully properties
 */
export function BuildingIntro({
  description,
  address,
  city,
  checkInTime,
  checkOutTime,
  totalUnits,
}: BuildingIntroProps) {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.3 });

  if (!description && !address) return null;

  return (
    <section
      ref={ref}
      className="runway-section-spacing px-6 sm:px-10 md:px-16 lg:px-20"
    >
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial="initial"
          animate={isVisible ? 'animate' : 'initial'}
          variants={sectionReveal}
          className="space-y-8"
        >
          {/* Description as prose */}
          {description && (
            <p className="runway-prose text-center runway-prose-width mx-auto text-lg leading-relaxed">
              {description}
            </p>
          )}

          {/* Quick info bar */}
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8 pt-4">
            {address && city && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4 shrink-0" />
                <span className="text-sm">{address}, {city}</span>
              </div>
            )}

            {checkInTime && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4 shrink-0" />
                <span className="text-sm">
                  Check-in {checkInTime}
                  {checkOutTime && ` · Check-out ${checkOutTime}`}
                </span>
              </div>
            )}

            {totalUnits && totalUnits > 1 && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Shield className="h-4 w-4 shrink-0" />
                <span className="text-sm">{totalUnits} serviced apartments</span>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
