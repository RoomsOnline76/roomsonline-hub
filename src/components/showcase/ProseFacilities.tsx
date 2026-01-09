import { motion } from 'framer-motion';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { sectionReveal } from '@/lib/motion';
import { composeAmenitiesProse } from '@/lib/editorialUtils';

interface ProseFacilitiesProps {
  facilities: string[];
}

/**
 * Amenities expressed as flowing prose
 * "Awaken to heated pools, retire to firelit libraries"
 */
export function ProseFacilities({ facilities }: ProseFacilitiesProps) {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.3 });
  
  const prose = composeAmenitiesProse(facilities);
  
  if (!prose) return null;

  return (
    <section 
      ref={ref}
      className="runway-section-spacing px-6 sm:px-10 md:px-16 lg:px-20 bg-muted/30"
    >
      <div className="max-w-4xl mx-auto text-center">
        <motion.div
          initial="initial"
          animate={isVisible ? "animate" : "initial"}
          variants={sectionReveal}
          className="space-y-6"
        >
          <span className="runway-section">The Experience</span>
          
          <p className="runway-prose">
            {prose}
          </p>

          {/* Facility chips for secondary detail */}
          {facilities.length > 4 && (
            <motion.div 
              className="flex flex-wrap justify-center gap-2 pt-4"
              initial={{ opacity: 0 }}
              animate={isVisible ? { opacity: 1 } : { opacity: 0 }}
              transition={{ delay: 0.4 }}
            >
              {facilities.slice(0, 8).map((facility, index) => (
                <span
                  key={index}
                  className="px-3 py-1.5 text-xs bg-background border border-border rounded-full text-muted-foreground"
                >
                  {facility}
                </span>
              ))}
              {facilities.length > 8 && (
                <span className="px-3 py-1.5 text-xs text-muted-foreground">
                  +{facilities.length - 8} more
                </span>
              )}
            </motion.div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
