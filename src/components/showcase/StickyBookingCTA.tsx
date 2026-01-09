import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { stickyCtaReveal } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import { FormattedPrice } from '@/components/FormattedPrice';
import { ArrowRight, ExternalLink, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StickyBookingCTAProps {
  onBook: () => void;
  lowestRate?: number | null;
  isExternal?: boolean;
  bookedRoomsCount?: number;
  propertyName?: string;
}

/**
 * Scroll-aware sticky CTA that evolves with context
 */
export function StickyBookingCTA({
  onBook,
  lowestRate,
  isExternal = false,
  bookedRoomsCount = 0,
  propertyName,
}: StickyBookingCTAProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [scrollContext, setScrollContext] = useState<'hero' | 'rooms' | 'checkout'>('hero');

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const viewportHeight = window.innerHeight;
      
      // Show after scrolling past hero
      setIsVisible(scrollY > viewportHeight * 0.5);

      // Determine context based on scroll position
      const roomsSection = document.getElementById('rooms-section');
      if (roomsSection) {
        const roomsTop = roomsSection.offsetTop;
        if (scrollY > roomsTop - viewportHeight * 0.5) {
          setScrollContext(bookedRoomsCount > 0 ? 'checkout' : 'rooms');
        } else {
          setScrollContext('hero');
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [bookedRoomsCount]);

  const getButtonContent = () => {
    if (bookedRoomsCount > 0) {
      return (
        <>
          <Check className="mr-2 h-4 w-4" />
          Checkout ({bookedRoomsCount} room{bookedRoomsCount > 1 ? 's' : ''})
        </>
      );
    }

    if (isExternal) {
      return (
        <>
          Book Now
          <ExternalLink className="ml-2 h-4 w-4" />
        </>
      );
    }

    switch (scrollContext) {
      case 'rooms':
        return (
          <>
            Select Your Room
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        );
      default:
        return (
          <>
            Book Your Escape
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        );
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          {...stickyCtaReveal}
          className="runway-sticky-cta"
        >
          <div className="max-w-4xl mx-auto px-4 py-3 sm:py-4">
            <div className="flex items-center justify-between gap-4">
              {/* Price Display */}
              <div className="hidden sm:block">
                {lowestRate ? (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase">From</span>
                    <div className="runway-price-large">
                      <FormattedPrice amount={lowestRate} />
                    </div>
                    <span className="text-xs text-muted-foreground">per night</span>
                  </div>
                ) : propertyName ? (
                  <div>
                    <p className="font-medium text-sm truncate max-w-[200px]">
                      {propertyName}
                    </p>
                  </div>
                ) : null}
              </div>

              {/* CTA Button */}
              <Button
                size="lg"
                onClick={onBook}
                className={cn(
                  "flex-1 sm:flex-none min-w-[200px]",
                  "bg-primary hover:bg-primary/90 text-primary-foreground",
                  "shadow-lg spring-bounce"
                )}
              >
                {getButtonContent()}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
