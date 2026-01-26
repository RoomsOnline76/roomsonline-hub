import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { sectionReveal } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import { MapPin, Share2, Mail, ArrowRight, Loader2 } from 'lucide-react';
import { useGoogleMapsApiKey } from '@/hooks/useFeatureFlags';
import { cn } from '@/lib/utils';

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

// Grayscale map styling for editorial aesthetic
const mapStyles = [
  { elementType: "geometry", stylers: [{ saturation: -100 }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f5" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.land_parcel", elementType: "labels.text.fill", stylers: [{ color: "#bdbdbd" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#eeeeee" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#e5e5e5" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#dadada" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
  { featureType: "transit.line", elementType: "geometry", stylers: [{ color: "#e5e5e5" }] },
  { featureType: "transit.station", elementType: "geometry", stylers: [{ color: "#eeeeee" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9c9c9" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
];

/**
 * Act V: The Invitation
 * Interactive Google Map with editorial grayscale styling + CTA cluster
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
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const { apiKey, isReady: apiKeyReady } = useGoogleMapsApiKey();
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);
  
  const hasCoordinates = latitude && longitude;

  // Load Google Maps script
  useEffect(() => {
    if (!apiKeyReady || !apiKey) return;

    if (window.google?.maps) {
      setMapsLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => setMapsLoaded(true);
    script.onerror = () => setMapError(true);
    document.head.appendChild(script);
  }, [apiKey, apiKeyReady]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || !mapsLoaded || !hasCoordinates || mapInstanceRef.current) return;
    if (!window.google?.maps) return;

    try {
      const position = { lat: Number(latitude), lng: Number(longitude) };

      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center: position,
        zoom: 14,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControl: true,
        styles: mapStyles,
      });

      // Create styled marker with ROL Pink
      new window.google.maps.Marker({
        position,
        map: mapInstanceRef.current,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: '#e91e8c', // ROL Pink
          fillOpacity: 0.9,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 10,
        },
        title: propertyName,
      });
    } catch (error) {
      console.error("Failed to initialize map:", error);
      setMapError(true);
    }
  }, [mapsLoaded, hasCoordinates, latitude, longitude, propertyName]);

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

  const showMap = hasCoordinates && apiKey && mapsLoaded && !mapError;
  const showLoading = hasCoordinates && apiKey && !mapsLoaded && !mapError;
  const showFallback = !hasCoordinates || mapError || !apiKey;

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
            <div className="relative aspect-[16/9] max-w-2xl mx-auto mb-8 rounded-xl overflow-hidden border border-border/40">
              {/* Loading state */}
              {showLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted z-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {/* Map container */}
              <div 
                ref={mapRef}
                className={cn(
                  "w-full h-full min-h-[200px]",
                  !showMap && "hidden"
                )}
              />

              {/* Fallback artistic placeholder on error or no API key */}
              {(mapError || !apiKey) && (
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
                >
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
                    </motion.div>
                  </div>
                </div>
              )}

              {/* Property info overlay */}
              <div className="absolute bottom-4 left-4 px-3 py-2 bg-background/95 backdrop-blur-sm rounded-lg shadow-md border border-border/50 z-20">
                <p className="font-medium text-sm">{propertyName}</p>
                <p className="text-xs text-muted-foreground">{city}, {country}</p>
              </div>

              {/* Coordinates display */}
              <div className="absolute bottom-3 right-3 text-xs text-muted-foreground/60 font-mono z-20">
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
