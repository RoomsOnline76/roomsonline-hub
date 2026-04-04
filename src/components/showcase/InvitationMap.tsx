import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { sectionReveal } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import { MapPin, Share2, Mail, ArrowRight, Loader2 } from 'lucide-react';
import { useGoogleMapsApiKey } from '@/hooks/useFeatureFlags';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Muted attraction pin colors to complement grayscale map
const ATTRACTION_COLORS = ['#D4AF37', '#A0A0A0', '#CD7F32', '#4DB6AC', '#7986CB'];

interface SiblingProperty {
  name: string;
  slug: string;
  lat: number;
  lng: number;
  heroImage?: string;
}

interface InvitationMapProps {
  propertyName: string;
  city: string;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
  onBookNow: () => void;
  onContact?: () => void;
  bookingLabel?: string;
  siblingProperties?: SiblingProperty[];
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
  siblingProperties = [],
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

      // Property marker - use active theme primary color (supports branded showcase mode)
      const primaryHsl = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
      const propertyPinColor = primaryHsl ? `hsl(${primaryHsl})` : '#E91E8C';

      new window.google.maps.Marker({
        position,
        map: mapInstanceRef.current,
        title: propertyName,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: propertyPinColor,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
          scale: 12,
        },
        zIndex: 200, // Above attractions
      });
    } catch (error) {
      console.error("Failed to initialize map:", error);
      setMapError(true);
    }
  }, [mapsLoaded, hasCoordinates, latitude, longitude, propertyName]);

  // Fetch nearby attractions + one eatery after map initializes
  useEffect(() => {
    if (!mapInstanceRef.current || !mapsLoaded || !hasCoordinates) return;
    if (!window.google?.maps?.places) return;

    const service = new google.maps.places.PlacesService(mapInstanceRef.current);
    const propertyLocation = { lat: Number(latitude), lng: Number(longitude) };

    // Fetch tourist attractions
    const attractionsRequest: google.maps.places.PlaceSearchRequest = {
      location: propertyLocation,
      radius: 2000,
      type: 'tourist_attraction',
    };

    // Fetch restaurants/eateries
    const eateryRequest: google.maps.places.PlaceSearchRequest = {
      location: propertyLocation,
      radius: 1500,
      type: 'restaurant',
    };

    let attractionResults: google.maps.places.PlaceResult[] = [];
    let eateryResult: google.maps.places.PlaceResult | null = null;

    // Fetch attractions first
    service.nearbySearch(attractionsRequest, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        attractionResults = results
          .filter(r => r.rating && r.user_ratings_total && r.user_ratings_total >= 10)
          .sort((a, b) => (b.rating || 0) - (a.rating || 0))
          .slice(0, 4); // Take 4 attractions, leave room for 1 eatery
      }

      // Then fetch eatery
      service.nearbySearch(eateryRequest, (eateryResults, eateryStatus) => {
        if (eateryStatus === google.maps.places.PlacesServiceStatus.OK && eateryResults) {
          // Get top-rated restaurant
          eateryResult = eateryResults
            .filter(r => r.rating && r.rating >= 4.0 && r.user_ratings_total && r.user_ratings_total >= 20)
            .sort((a, b) => (b.rating || 0) - (a.rating || 0))[0] || null;
        }

        // Combine: 4 attractions + 1 eatery
        const combined = [...attractionResults];
        if (eateryResult) {
          combined.push(eateryResult);
        }
        setAttractions(combined);
      });
    });
  }, [mapsLoaded, hasCoordinates, latitude, longitude]);

  // Render attraction markers when attractions are loaded and fit bounds
  useEffect(() => {
    if (!mapInstanceRef.current || attractions.length === 0 || !hasCoordinates) return;

    // Clear existing attraction markers
    attractionMarkersRef.current.forEach(m => m.setMap(null));
    attractionMarkersRef.current = [];

    // Create shared InfoWindow for hover
    if (!attractionInfoWindowRef.current) {
      attractionInfoWindowRef.current = new google.maps.InfoWindow();
    }

    // Create bounds to fit all markers
    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: Number(latitude), lng: Number(longitude) }); // Include property

    attractions.forEach((place, index) => {
      if (!place.geometry?.location) return;

      // Extend bounds to include this attraction
      bounds.extend(place.geometry.location);

      // Check if this is an eatery (last item if we have 5)
      const isEatery = index === attractions.length - 1 && attractions.length === 5;
      
      // Create display name (truncated for label)
      const displayName = (place.name || '').substring(0, 20) + ((place.name?.length || 0) > 20 ? '…' : '');
      const labelPrefix = isEatery ? '🍽️ ' : '';

      // Colored circles only - no labels to prevent stacking/overlap
      const marker = new google.maps.Marker({
        position: place.geometry.location,
        map: mapInstanceRef.current,
        title: place.name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: ATTRACTION_COLORS[index],
          fillOpacity: 0.9,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 8,
        },
        zIndex: 100 + index,
      });

      // Create InfoWindow content with rating - show on click only
      const ratingStars = place.rating ? '★'.repeat(Math.round(place.rating)) : '';
      const fullName = place.name || 'Attraction';
      const typeLabel = isEatery ? '<span style="font-size: 10px; color: #888;">🍽️ Eatery</span>' : '';

      // Show InfoWindow on click for more details
      marker.addListener('click', () => {
        attractionInfoWindowRef.current?.setContent(`
          <div style="font-family: system-ui, sans-serif; padding: 8px 12px; max-width: 200px;">
            <p style="font-weight: 600; font-size: 13px; margin: 0 0 4px 0; color: #111;">${fullName}</p>
            <p style="font-size: 12px; color: ${ATTRACTION_COLORS[index]}; margin: 0 0 4px 0;">${ratingStars} ${place.rating?.toFixed(1) || ''}</p>
            ${typeLabel}
            <a href="https://www.google.com/maps/place/?q=place_id:${place.place_id}" target="_blank" 
               style="font-size: 11px; color: #0066cc; text-decoration: none;">View on Maps →</a>
          </div>
        `);
        attractionInfoWindowRef.current?.open(mapInstanceRef.current, marker);
      });

      attractionMarkersRef.current.push(marker);
    });

    // Fit map to show all markers with padding
    mapInstanceRef.current.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });

    // Cleanup on unmount
    return () => {
      attractionMarkersRef.current.forEach(m => m.setMap(null));
    };
  }, [attractions, hasCoordinates, latitude, longitude]);

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

              {/* Attractions Legend - below map, show all 5 with tooltips */}
              {attractions.length > 0 && (
                <div className="mt-4 px-2">
                  <p className="text-xs font-medium text-muted-foreground mb-2 text-center">Nearby:</p>
                  <TooltipProvider>
                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                      {attractions.slice(0, 5).map((a, i) => (
                        <Tooltip key={a.place_id}>
                          <TooltipTrigger asChild>
                            <button className="flex items-center gap-1.5 whitespace-nowrap hover:text-foreground transition-colors cursor-pointer">
                              <span 
                                className="w-2.5 h-2.5 rounded-full shrink-0" 
                                style={{ backgroundColor: ATTRACTION_COLORS[i] }} 
                              />
                              <span className="max-w-[140px] sm:max-w-[180px] truncate">
                                {a.name}
                              </span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[280px] p-3">
                            <div className="space-y-1">
                              <p className="font-medium text-sm">{a.name}</p>
                              {a.rating && (
                                <p className="text-xs text-amber-500">
                                  {'★'.repeat(Math.round(a.rating))}{'☆'.repeat(5 - Math.round(a.rating))} {a.rating.toFixed(1)}
                                </p>
                              )}
                              {a.vicinity && (
                                <p className="text-xs text-muted-foreground">{a.vicinity}</p>
                              )}
                              <a 
                                href={`https://www.google.com/maps/place/?q=place_id:${a.place_id}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline inline-block mt-1"
                              >
                                View on Maps →
                              </a>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </TooltipProvider>
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
