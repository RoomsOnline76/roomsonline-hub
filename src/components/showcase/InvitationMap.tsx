import { motion } from 'framer-motion';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { sectionReveal } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import { MapPin, Share2, Mail, ArrowRight } from 'lucide-react';

interface InvitationMapProps {
  propertyName: string;
  city: string;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
  onBookNow: () => void;
  onContact?: () => void;
  bookingLabel?: string;
}

/**
 * Act V: The Invitation
 * Artistic map with custom pin as design element + CTA cluster
 */
export function InvitationMap({
  propertyName,
  city,
  country,
  latitude,
  longitude,
  onBookNow,
  onContact,
  bookingLabel = 'Book Your Escape',
}: InvitationMapProps) {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.2 });
  
  const hasCoordinates = latitude && longitude;

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: propertyName,
          text: `Discover ${propertyName} in ${city}, ${country}`,
          url: window.location.href,
        });
      } catch (err) {
        // User cancelled or error
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href);
    }
  };

  return (
    <section 
      ref={ref}
      className="runway-section-spacing px-6 sm:px-10 md:px-16 lg:px-20 bg-muted/30"
    >
      <motion.div
        initial="initial"
        animate={isVisible ? "animate" : "initial"}
        variants={sectionReveal}
        className="max-w-4xl mx-auto"
      >
        {/* Section Header */}
        <div className="text-center mb-10 sm:mb-14">
          <span className="runway-section">The Invitation</span>
        </div>

        {/* Location Display */}
        <div className="text-center mb-10">
          {hasCoordinates ? (
            // Map placeholder with artistic treatment
            <div className="relative aspect-[16/9] max-w-2xl mx-auto mb-8 rounded-xl overflow-hidden bg-card border border-border/40">
              {/* Abstract map background */}
              <div 
                className="absolute inset-0"
                style={{
                  background: `
                    radial-gradient(circle at ${50 + (longitude || 0) * 0.5}% ${50 - (latitude || 0) * 0.5}%, 
                    hsl(var(--primary) / 0.15) 0%, 
                    transparent 30%),
                    linear-gradient(135deg, hsl(220 20% 95%) 0%, hsl(220 15% 90%) 100%)
                  `,
                }}
              />
              
              {/* Pin marker */}
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.div
                  initial={{ scale: 0, y: -20 }}
                  animate={isVisible ? { scale: 1, y: 0 } : {}}
                  transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
                  className="flex flex-col items-center"
                >
                  <div className="p-3 bg-primary text-primary-foreground rounded-full shadow-lg">
                    <MapPin className="h-6 w-6" />
                  </div>
                  <div className="mt-2 px-3 py-1.5 bg-background/95 backdrop-blur-sm rounded-lg shadow-md border border-border/50">
                    <p className="font-medium text-sm">{propertyName}</p>
                    <p className="text-xs text-muted-foreground">{city}, {country}</p>
                  </div>
                </motion.div>
              </div>

              {/* Coordinates display */}
              <div className="absolute bottom-3 right-3 text-xs text-muted-foreground/60 font-mono">
                {latitude?.toFixed(4)}°, {longitude?.toFixed(4)}°
              </div>
            </div>
          ) : (
            // Journey Guide fallback
            <div className="max-w-md mx-auto mb-8 p-8 bg-card border border-border/40 rounded-xl">
              <MapPin className="h-8 w-8 mx-auto mb-4 text-primary" />
              <h3 className="runway-room-name mb-2">Journey to {city}</h3>
              <p className="runway-facts">
                Located in the heart of {city}, {country}. 
                Contact us for detailed directions and travel arrangements.
              </p>
            </div>
          )}

          {/* Location text */}
          <p className="runway-facts mb-8">
            Find us in {city}, {country}
          </p>
        </div>

        {/* CTA Cluster */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            size="lg"
            onClick={onBookNow}
            className="min-w-[200px] bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg"
          >
            {bookingLabel}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>

          {onContact && (
            <Button
              size="lg"
              variant="outline"
              onClick={onContact}
              className="min-w-[140px]"
            >
              <Mail className="mr-2 h-4 w-4" />
              Inquire
            </Button>
          )}

          <Button
            size="lg"
            variant="ghost"
            onClick={handleShare}
            className="min-w-[140px]"
          >
            <Share2 className="mr-2 h-4 w-4" />
            Share
          </Button>
        </div>
      </motion.div>
    </section>
  );
}
