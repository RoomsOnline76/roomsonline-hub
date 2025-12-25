import { useEffect, useRef, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Loader2 } from "lucide-react";
import { getPropertyUrl } from "@/lib/config";
import { filterPropertiesByMapFilters } from "@/lib/mapFilters";
import { MarkerClusterer, Renderer } from "@googlemaps/markerclusterer";

// Global callback for Google Maps - iOS requires a real callback function
declare global {
  interface Window {
    initGoogleMaps?: () => void;
    google?: {
      maps: typeof google.maps;
    };
  }
}

const isIOS = () => typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

interface Property {
  id: string;
  name: string;
  slug: string | null;
  latitude: number | null;
  longitude: number | null;
  city: string;
  country: string;
  price_per_night: number;
  property_type: string;
  images: string[] | null;
  external_system: string | null;
  external_id: string | null;
  navigation_tags: string[] | null;
}

interface PropertiesMapProps {
  enabledTypes?: Record<string, boolean>;
  typeColors?: Record<string, string>;
  selectedMapFilters?: string[];
  filteredPropertyIds?: string[] | null;
}

const DEFAULT_COLOR = "#e11d48";

// Custom marker with property type data
interface PropertyMarker extends google.maps.Marker {
  propertyType?: string;
}

export function PropertiesMap({ enabledTypes, typeColors, selectedMapFilters = [], filteredPropertyIds }: PropertiesMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const markersRef = useRef<PropertyMarker[]>([]);
  const openInfoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);

  // Fetch properties with coordinates
  useEffect(() => {
    const fetchProperties = async () => {
      const { data, error } = await supabase
        .from("public_properties")
        .select("id, name, slug, latitude, longitude, city, country, price_per_night, property_type, images, external_system, external_id, navigation_tags")
        .not("latitude", "is", null)
        .not("longitude", "is", null);

      if (!error && data) {
        // Parse images and navigation_tags if needed
        const parsedData = data.map(p => ({
          ...p,
          images: Array.isArray(p.images) ? (p.images as string[]) : null,
          navigation_tags: Array.isArray(p.navigation_tags) ? (p.navigation_tags as string[]) : null
        }));
        setProperties(parsedData);
      }
    };

    fetchProperties();
  }, []);

  // Fetch Google Maps API key
  useEffect(() => {
    const fetchApiKey = async () => {
      try {
        const { data, error } = await supabase
          .from("api_keys")
          .select("key_value")
          .eq("key_name", "google_maps_api_key")
          .maybeSingle();

        if (error) throw error;

        if (data?.key_value && !data.key_value.startsWith("placeholder_key_")) {
          setApiKey(data.key_value);
        }
      } catch (error) {
        console.error("Error fetching API key:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchApiKey();
  }, []);

  // Setup global callback BEFORE loading script - critical for iOS
  useEffect(() => {
    window.initGoogleMaps = () => {
      console.log("Google Maps loaded via callback");
      setMapsLoaded(true);
    };

    return () => {
      delete window.initGoogleMaps;
    };
  }, []);

  // Load Google Maps script with real callback (iOS-safe)
  useEffect(() => {
    if (!apiKey || loading) return;

    // Already loaded
    if (window.google?.maps?.Map) {
      console.log("Google Maps already available");
      setMapsLoaded(true);
      return;
    }

    // Check if script already exists
    const existingScript = document.querySelector(`script[src*="maps.googleapis.com"]`);
    if (existingScript) {
      console.log("Google Maps script already in DOM, polling...");
      // Poll for google.maps to be available
      const intervalId = setInterval(() => {
        if (window.google?.maps?.Map) {
          console.log("Google Maps loaded via polling");
          setMapsLoaded(true);
          clearInterval(intervalId);
        }
      }, 100);

      // Timeout after 10s
      const timeoutId = setTimeout(() => {
        clearInterval(intervalId);
        if (!window.google?.maps?.Map) {
          console.error("Google Maps failed to load (timeout)");
          setMapError(true);
        }
      }, 10000);

      return () => {
        clearInterval(intervalId);
        clearTimeout(timeoutId);
      };
    }

    console.log("Loading Google Maps script...");
    // Create and load script with real callback
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,marker&callback=initGoogleMaps&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onerror = (e) => {
      console.error("Failed to load Google Maps script", e);
      setMapError(true);
    };
    document.head.appendChild(script);

    // Timeout fallback
    const timeoutId = setTimeout(() => {
      if (!window.google?.maps?.Map) {
        console.error("Google Maps failed to load (timeout)");
        setMapError(true);
      }
    }, 15000);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [apiKey, loading]);

  // Filter properties based on enabled types, map filters, and search filter
  const filteredProperties = useMemo(() => {
    let filtered = properties;
    
    // Filter by search (if property IDs are provided)
    if (filteredPropertyIds !== null && filteredPropertyIds !== undefined) {
      filtered = filtered.filter((p) => filteredPropertyIds.includes(p.id));
    }
    
    // Filter by property type
    if (enabledTypes) {
      filtered = filtered.filter((p) => enabledTypes[p.property_type] !== false);
    }
    
    // Filter by map filters (navigation tags)
    if (selectedMapFilters.length > 0) {
      filtered = filterPropertiesByMapFilters(filtered, selectedMapFilters);
    }
    
    return filtered;
  }, [properties, enabledTypes, selectedMapFilters, filteredPropertyIds]);

  // Create custom renderer for clusters with weighted dominant colors
  const createClusterRenderer = (colors: Record<string, string> | undefined): Renderer => ({
    render: ({ count, position, markers }) => {
      // Count property types in this cluster
      const typeCounts: Record<string, number> = {};
      markers?.forEach((marker) => {
        const propertyMarker = marker as PropertyMarker;
        const type = propertyMarker.propertyType || 'default';
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      });
      
      // Find dominant type (most pins)
      const dominantType = Object.keys(typeCounts).reduce(
        (a, b) => (typeCounts[a] || 0) > (typeCounts[b] || 0) ? a : b,
        'default'
      );
      const clusterColor = colors?.[dominantType] || DEFAULT_COLOR;

      // Subtle size scaling based on count
      const scale = 16 + Math.min(count * 0.3, 6);

      return new window.google.maps.Marker({
        position,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: clusterColor,
          fillOpacity: 0.85,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale,
        },
        label: {
          text: String(count),
          color: '#ffffff',
          fontSize: '11px',
          fontWeight: '600',
        },
        zIndex: Number(google.maps.Marker.MAX_ZINDEX) + count,
      });
    },
  });

  // Initialize map once - with slight delay to ensure DOM is ready
  useEffect(() => {
    if (!mapsLoaded) {
      console.log("Map init check: mapsLoaded is false");
      return;
    }
    
    if (mapInstanceRef.current) {
      console.log("Map init check: map already exists");
      return;
    }

    // Small delay to ensure DOM is fully rendered after state change
    const initTimer = setTimeout(() => {
      if (!mapRef.current) {
        console.log("Map init check: mapRef.current is null");
        return;
      }
      
      if (!window.google?.maps?.Map) {
        console.log("Map init check: google.maps.Map not available");
        return;
      }

      console.log("Initializing Google Map...");
      try {
        mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
          center: { lat: -28.4793, lng: 24.6727 },
          zoom: 5,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          styles: [
            // Grayscale styling for the entire map
            {
              elementType: "geometry",
              stylers: [{ saturation: -100 }]
            },
            {
              elementType: "labels.text.fill",
              stylers: [{ saturation: -100 }, { lightness: 20 }]
            },
            {
              elementType: "labels.text.stroke",
              stylers: [{ saturation: -100 }, { lightness: 100 }]
            },
            {
              elementType: "labels.icon",
              stylers: [{ saturation: -100 }]
            },
            {
              featureType: "water",
              elementType: "geometry",
              stylers: [{ saturation: -100 }, { lightness: 30 }]
            },
            {
              featureType: "road",
              elementType: "geometry",
              stylers: [{ saturation: -100 }, { lightness: 10 }]
            },
            {
              featureType: "poi",
              elementType: "labels",
              stylers: [{ visibility: "off" }]
            }
          ]
        });

        console.log("Google Map initialized successfully");
        setMapReady(true);
        // Aggressive resize triggers for iOS
        const triggerResize = () => {
          if (mapInstanceRef.current && window.google?.maps) {
            window.google.maps.event.trigger(mapInstanceRef.current, 'resize');
          }
        };

        // Multiple resize triggers at different intervals for iOS
        setTimeout(triggerResize, 100);
        setTimeout(triggerResize, 300);
        setTimeout(triggerResize, 500);
        
        if (isIOS()) {
          setTimeout(triggerResize, 1000);
          setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
            triggerResize();
          }, 1500);
        }
      } catch (error) {
        console.error("Error initializing Google Map:", error);
        setMapError(true);
      }
    }, 50);

    return () => clearTimeout(initTimer);
  }, [mapsLoaded]);

  // Trigger resize when enabledTypes change
  useEffect(() => {
    if (mapInstanceRef.current && window.google?.maps) {
      const timer = setTimeout(() => {
        window.google.maps.event.trigger(mapInstanceRef.current, 'resize');
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [enabledTypes]);

  // Update markers and clusterer when filtered properties change
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !window.google?.maps) return;

    // Clear existing clusterer and markers
    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
    }
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    if (filteredProperties.length === 0) return;

    const bounds = new window.google.maps.LatLngBounds();
    const newMarkers: PropertyMarker[] = [];
    
    filteredProperties.forEach((property) => {
      if (!property.latitude || !property.longitude) return;

      const position = { lat: Number(property.latitude), lng: Number(property.longitude) };
      bounds.extend(position);

      const markerColor = typeColors?.[property.property_type] || DEFAULT_COLOR;

      // Create marker with subtle styling
      const marker: PropertyMarker = new window.google.maps.Marker({
        position,
        title: property.name,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: markerColor,
          fillOpacity: 0.9,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 8,
        },
      });

      // Store property type for cluster weighting
      marker.propertyType = property.property_type;

      // Get image - use stored images only
      const mainImage = property.images?.[0];
      
      const imageHtml = mainImage 
        ? `<img src="${mainImage}" alt="${property.name}" style="width: 100%; height: 100px; object-fit: cover; border-radius: 6px; margin-bottom: 8px;" onerror="this.style.display='none'" />`
        : '';

      const infoWindow = new window.google.maps.InfoWindow({
        content: `
          <div style="padding: 8px; max-width: 220px;">
            ${imageHtml}
            <h3 style="font-weight: 600; margin-bottom: 4px; color: #111;">${property.name}</h3>
            <p style="font-size: 12px; color: #666; margin-bottom: 8px;">${property.city}, ${property.country}</p>
            <a href="${getPropertyUrl(property.slug || property.id)}" 
               style="display: inline-block; padding: 6px 12px; background: #e11d48; color: white; border-radius: 6px; text-decoration: none; font-size: 12px;">
              View Property
            </a>
          </div>
        `
      });

      marker.addListener("click", () => {
        // Close any previously open info window
        if (openInfoWindowRef.current) {
          openInfoWindowRef.current.close();
        }
        infoWindow.open(mapInstanceRef.current, marker);
        openInfoWindowRef.current = infoWindow;
      });

      newMarkers.push(marker);
    });

    markersRef.current = newMarkers;

    // Create or update clusterer
    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
      clustererRef.current.addMarkers(newMarkers);
    } else {
      clustererRef.current = new MarkerClusterer({
        map: mapInstanceRef.current,
        markers: newMarkers,
        renderer: createClusterRenderer(typeColors),
      });
    }

    // Fit map to show all markers
    if (filteredProperties.length > 1) {
      mapInstanceRef.current.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
    } else if (filteredProperties.length === 1) {
      mapInstanceRef.current.setCenter(bounds.getCenter());
      mapInstanceRef.current.setZoom(12);
    }
  }, [mapReady, filteredProperties, typeColors]);

  // Loading state
  if (loading || (apiKey && !mapsLoaded && !mapError)) {
    return (
      <div className="w-full h-full rounded-xl border border-border bg-muted flex items-center justify-center">
        <div className="text-center space-y-2">
          <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-muted-foreground mx-auto" />
          <p className="text-xs text-muted-foreground">Loading map...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (mapError) {
    return (
      <div className="w-full h-full rounded-xl border border-border bg-muted flex items-center justify-center">
        <div className="text-center space-y-2">
          <MapPin className="h-6 w-6 sm:h-8 sm:w-8 mx-auto text-muted-foreground" />
          <p className="text-xs sm:text-sm text-muted-foreground">Map failed to load</p>
          <button 
            onClick={() => window.location.reload()} 
            className="text-xs text-primary underline"
          >
            Refresh page
          </button>
        </div>
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div className="w-full h-full rounded-xl border border-border bg-muted flex items-center justify-center">
        <div className="text-center space-y-2">
          <MapPin className="h-6 w-6 sm:h-8 sm:w-8 mx-auto text-muted-foreground" />
          <p className="text-xs sm:text-sm text-muted-foreground">Map unavailable</p>
        </div>
      </div>
    );
  }

  if (properties.length === 0) {
    return (
      <div className="w-full h-full rounded-xl border border-border bg-muted flex items-center justify-center">
        <div className="text-center space-y-2">
          <MapPin className="h-6 w-6 sm:h-8 sm:w-8 mx-auto text-muted-foreground" />
          <p className="text-xs sm:text-sm text-muted-foreground px-4">No properties with locations available</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={mapRef} 
      className="map-container w-full rounded-xl border border-border shadow-lg"
      style={{ height: '100%', minHeight: '280px' }}
    />
  );
}
