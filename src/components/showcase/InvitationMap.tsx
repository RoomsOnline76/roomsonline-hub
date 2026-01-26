import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { sectionReveal } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import { MapPin, Share2, Mail, ArrowRight, Loader2 } from 'lucide-react';
import { useGoogleMapsApiKey } from '@/hooks/useFeatureFlags';
import { cn } from '@/lib/utils';

// Muted attraction pin colors to complement grayscale map
const ATTRACTION_COLORS = ['#D4AF37', '#A0A0A0', '#CD7F32', '#4DB6AC', '#7986CB'];

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
  
  // Nearby attractions state
  const [attractions, setAttractions] = useState<google.maps.places.PlaceResult[]>([]);
  const attractionMarkersRef = useRef<google.maps.Marker[]>([]);
  const attractionInfoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  
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

  // Fetch nearby attractions after map initializes
  useEffect(() => {
    if (!mapInstanceRef.current || !mapsLoaded || !hasCoordinates) return;
    if (!window.google?.maps?.places) return;

    const service = new google.maps.places.PlacesService(mapInstanceRef.current);
    const request: google.maps.places.PlaceSearchRequest = {
      location: { lat: Number(latitude), lng: Number(longitude) },
      radius: 2000,
      type: 'tourist_attraction',
    };

    service.nearbySearch(request, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        const topAttractions = results
          .filter(r => r.rating && r.user_ratings_total && r.user_ratings_total >= 10)
          .sort((a, b) => (b.rating || 0) - (a.rating || 0))
          .slice(0, 5);
        
        setAttractions(topAttractions);
      }
    });
  }, [mapsLoaded, hasCoordinates, latitude, longitude]);

  // Render attraction markers when attractions are loaded
  useEffect(() => {
    if (!mapInstanceRef.current || attractions.length === 0) return;

    // Clear existing attraction markers
    attractionMarkersRef.current.forEach(m => m.setMap(null));
    attractionMarkersRef.current = [];

    // Create shared InfoWindow for hover
    if (!attractionInfoWindowRef.current) {
      attractionInfoWindowRef.current = new google.maps.InfoWindow();
    }

    attractions.forEach((place, index) => {
      if (!place.geometry?.location) return;

      const marker = new google.maps.Marker({
        position: place.geometry.location,
        map: mapInstanceRef.current,
        title: place.name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: ATTRACTION_COLORS[index],
          fillOpacity: 0.85,
          strokeColor: '#ffffff',
          strokeWeight: 1.5,
          scale: 7,
        },
        zIndex: 100 + index,
      });

      // Create InfoWindow content with rating
      const ratingStars = place.rating ? '★'.repeat(Math.round(place.rating)) : '';
      const displayName = (place.name || '').substring(0, 25) + ((place.name?.length || 0) > 25 ? '...' : '');

      // Show InfoWindow on hover
      marker.addListener('mouseover', () => {
        attractionInfoWindowRef.current?.setContent(`
          <div style="font-family: system-ui, sans-serif; padding: 6px 10px; max-width: 160px;">
            <p style="font-weight: 600; font-size: 12px; margin: 0 0 2px 0; color: #111;">${displayName}</p>
            <p style="font-size: 11px; color: ${ATTRACTION_COLORS[index]}; margin: 0;">${ratingStars} ${place.rating?.toFixed(1) || ''}</p>
          </div>
        `);
        attractionInfoWindowRef.current?.open(mapInstanceRef.current, marker);
      });

      marker.addListener('mouseout', () => {
        attractionInfoWindowRef.current?.close();
      });

      // Click to open in Google Maps
      marker.addListener('click', () => {
        if (place.place_id) {
          window.open(`https://www.google.com/maps/place/?q=place_id:${place.place_id}`, '_blank');
        }
      });

      attractionMarkersRef.current.push(marker);
    });

    // Cleanup on unmount
    return () => {
      attractionMarkersRef.current.forEach(m => m.setMap(null));
    };
  }, [attractions]);

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

        <div className="text-center mb-10">
          {hasCoordinates ? (
            <>
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

              {/* Attractions Legend - below map, subtle */}
              {attractions.length > 0 && (
                <div className="flex flex-wrap justify-center gap-3 mt-4 text-xs text-muted-foreground">
                  <span className="font-medium">Nearby:</span>
                  {attractions.slice(0, 3).map((a, i) => (
                    <span key={a.place_id} className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ATTRACTION_COLORS[i] }} />
                      {(a.name || '').substring(0, 18)}{(a.name?.length || 0) > 18 ? '...' : ''}
                    </span>
                  ))}
                </div>
              )}
            </>
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
