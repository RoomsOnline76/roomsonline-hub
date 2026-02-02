import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useGoogleMapsApiKey } from '@/hooks/useFeatureFlags';
import { MapPin, TreePine, Utensils, Palette, Mountain, Heart, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Category configuration for styling
const categoryConfig: Record<string, { icon: typeof TreePine; color: string; label: string }> = {
  nature: { icon: TreePine, color: '#22c55e', label: 'Nature' },
  culture: { icon: Palette, color: '#8b5cf6', label: 'Culture' },
  dining: { icon: Utensils, color: '#f97316', label: 'Dining' },
  adventure: { icon: Mountain, color: '#3b82f6', label: 'Adventure' },
  wellness: { icon: Heart, color: '#ec4899', label: 'Wellness' },
};

// Grayscale map styling for editorial aesthetic
const mapStyles = [
  { elementType: "geometry", stylers: [{ saturation: -100 }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f5" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#eeeeee" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#dadada" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9c9c9" }] },
];

interface LocalExperience {
  id: string;
  title: string;
  category: string | null;
  description: string | null;
  why_locals_love_it: string | null;
  distance_km: number | null;
  image_url: string | null;
}

interface JourneyDestinationMapProps {
  propertyId: string;
  propertyName: string;
  compact?: boolean;
  className?: string;
}

export function JourneyDestinationMap({
  propertyId,
  propertyName,
  compact = false,
  className,
}: JourneyDestinationMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const { apiKey, isReady: apiKeyReady } = useGoogleMapsApiKey();
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [isExpanded, setIsExpanded] = useState(!compact);

  // Fetch property coordinates
  const { data: propertyData, isLoading: propertyLoading } = useQuery({
    queryKey: ['journey-property-location', propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('public_properties')
        .select('latitude, longitude, city, country')
        .eq('id', propertyId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!propertyId,
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes
  });

  // Fetch local experiences
  const { data: experiences, isLoading: experiencesLoading } = useQuery({
    queryKey: ['journey-experiences', propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('local_experiences')
        .select('id, title, category, description, why_locals_love_it, distance_km, image_url')
        .eq('property_id', propertyId)
        .eq('is_active', true)
        .order('display_order')
        .limit(5);
      if (error) throw error;
      return data as LocalExperience[];
    },
    enabled: !!propertyId,
    staleTime: 1000 * 60 * 10,
  });

  const hasCoordinates = propertyData?.latitude && propertyData?.longitude;
  const isLoading = propertyLoading || experiencesLoading;

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
      const position = { lat: Number(propertyData.latitude), lng: Number(propertyData.longitude) };

      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center: position,
        zoom: 13,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControl: false,
        styles: mapStyles,
        gestureHandling: 'cooperative',
      });

      // Property marker - distinctive pink ROL pin
      const propertyMarker = new window.google.maps.Marker({
        position,
        map: mapInstanceRef.current,
        title: propertyName,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: '#E91E8C', // ROL pink
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
          scale: 10,
        },
        zIndex: 200,
      });

      markersRef.current.push(propertyMarker);
    } catch (error) {
      console.error("Failed to initialize map:", error);
      setMapError(true);
    }
  }, [mapsLoaded, hasCoordinates, propertyData, propertyName]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      markersRef.current.forEach(m => m.setMap(null));
      markersRef.current = [];
      mapInstanceRef.current = null;
    };
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className={cn("border-t border-border pt-4 space-y-3", className)}>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }

  // No coordinates fallback
  if (!hasCoordinates && !isLoading) {
    const city = propertyData?.city || 'this destination';
    return (
      <div className={cn("border-t border-border pt-4", className)}>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <MapPin className="h-4 w-4" />
          <span>Explore {city}</span>
        </div>
        {experiences && experiences.length > 0 && (
          <ExperiencesList experiences={experiences} />
        )}
      </div>
    );
  }

  const showMap = hasCoordinates && apiKey && mapsLoaded && !mapError;
  const showMapLoading = hasCoordinates && apiKey && !mapsLoaded && !mapError;

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded} className={cn("border-t border-border pt-4", className)}>
      <CollapsibleTrigger className="w-full flex items-center justify-between py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <span>Discover {propertyData?.city || 'Nearby'}</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-4 pt-2">
        {/* Map */}
        <div className="relative aspect-video rounded-lg overflow-hidden border border-border/50 bg-muted">
          {showMapLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          <div 
            ref={mapRef}
            className={cn(
              "w-full h-full min-h-[120px]",
              !showMap && "hidden"
            )}
          />

          {(mapError || !apiKey) && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <div className="text-center">
                <MapPin className="h-8 w-8 text-primary mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {propertyData?.city}, {propertyData?.country}
                </p>
              </div>
            </div>
          )}

          {/* Property label overlay */}
          {showMap && (
            <div className="absolute bottom-2 left-2 px-2 py-1 bg-background/90 backdrop-blur-sm rounded text-xs font-medium shadow-sm">
              {propertyName}
            </div>
          )}
        </div>

        {/* Experiences list */}
        {experiences && experiences.length > 0 && (
          <ExperiencesList experiences={experiences} />
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

// Separate component for experiences list
function ExperiencesList({ experiences }: { experiences: LocalExperience[] }) {
  return (
    <TooltipProvider>
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Nearby Experiences</p>
        <div className="space-y-1.5">
          {experiences.map((exp) => {
            const config = categoryConfig[exp.category || 'nature'] || categoryConfig.nature;
            const Icon = config.icon;

            return (
              <Tooltip key={exp.id}>
                <TooltipTrigger asChild>
                  <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                    <div 
                      className="mt-0.5 p-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: `${config.color}20` }}
                    >
                      <Icon className="h-3 w-3" style={{ color: config.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">{exp.title}</p>
                        {exp.distance_km && (
                          <span className="text-xs text-muted-foreground shrink-0">
                            {exp.distance_km}km
                          </span>
                        )}
                      </div>
                      {exp.why_locals_love_it && (
                        <p className="text-xs text-muted-foreground line-clamp-1 italic">
                          "{exp.why_locals_love_it}"
                        </p>
                      )}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px] p-3">
                  <div className="space-y-1.5">
                    <p className="font-medium text-sm">{exp.title}</p>
                    <p className="text-xs" style={{ color: config.color }}>{config.label}</p>
                    {exp.description && (
                      <p className="text-xs text-muted-foreground">{exp.description}</p>
                    )}
                    {exp.why_locals_love_it && (
                      <p className="text-xs italic text-muted-foreground">
                        💡 "{exp.why_locals_love_it}"
                      </p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
