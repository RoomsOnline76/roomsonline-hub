import { useEffect, useRef, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Loader2 } from "lucide-react";
import { getPropertyUrl } from "@/lib/config";

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
}

interface PropertiesMapProps {
  enabledTypes?: Record<string, boolean>;
  typeColors?: Record<string, string>;
}

const DEFAULT_COLOR = "#e11d48";

export function PropertiesMap({ enabledTypes, typeColors }: PropertiesMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);

  // Fetch properties with coordinates
  useEffect(() => {
    const fetchProperties = async () => {
      const { data, error } = await supabase
        .from("public_properties")
        .select("id, name, slug, latitude, longitude, city, country, price_per_night, property_type, images")
        .not("latitude", "is", null)
        .not("longitude", "is", null);

      if (!error && data) {
        // Parse images if needed
        const parsedData = data.map(p => ({
          ...p,
          images: Array.isArray(p.images) ? (p.images as string[]) : null
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
    if (window.google?.maps) {
      setMapsLoaded(true);
      return;
    }

    // Check if script already exists
    const existingScript = document.querySelector(`script[src*="maps.googleapis.com"]`);
    if (existingScript) {
      // Poll for google.maps to be available
      const intervalId = setInterval(() => {
        if (window.google?.maps) {
          setMapsLoaded(true);
          clearInterval(intervalId);
        }
      }, 100);

      // Timeout after 10s
      const timeoutId = setTimeout(() => {
        clearInterval(intervalId);
        if (!window.google?.maps) {
          console.error("Google Maps failed to load (timeout)");
          setMapError(true);
        }
      }, 10000);

      return () => {
        clearInterval(intervalId);
        clearTimeout(timeoutId);
      };
    }

    // Create and load script with real callback
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,marker&callback=initGoogleMaps`;
    script.async = true;
    script.onerror = () => {
      console.error("Failed to load Google Maps script");
      setMapError(true);
    };
    document.head.appendChild(script);

    // Timeout fallback
    const timeoutId = setTimeout(() => {
      if (!window.google?.maps) {
        console.error("Google Maps failed to load (timeout)");
        setMapError(true);
      }
    }, 10000);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [apiKey, loading]);

  // Filter properties based on enabled types
  const filteredProperties = useMemo(() => {
    if (!enabledTypes) return properties;
    return properties.filter((p) => enabledTypes[p.property_type] !== false);
  }, [properties, enabledTypes]);

  // Initialize map once
  useEffect(() => {
    if (!mapRef.current || !mapsLoaded || !window.google?.maps || mapInstanceRef.current) return;

    try {
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center: { lat: -28.4793, lng: 24.6727 },
        zoom: 5,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        mapId: "PROPERTIES_MAP",
        styles: [
          {
            featureType: "poi",
            elementType: "labels",
            stylers: [{ visibility: "off" }]
          }
        ]
      });

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

  // Update markers when filtered properties change - depends on mapsLoaded to ensure map exists
  useEffect(() => {
    if (!mapsLoaded || !mapInstanceRef.current || !window.google?.maps) return;

    // Clear existing markers
    markersRef.current.forEach((marker) => marker.map = null);
    markersRef.current = [];

    if (filteredProperties.length === 0) return;

    const bounds = new window.google.maps.LatLngBounds();
    
    filteredProperties.forEach((property) => {
      if (!property.latitude || !property.longitude) return;

      const position = { lat: Number(property.latitude), lng: Number(property.longitude) };
      bounds.extend(position);

      const markerColor = typeColors?.[property.property_type] || DEFAULT_COLOR;

      // Create custom pin element for AdvancedMarkerElement
      const pinElement = document.createElement("div");
      pinElement.style.cssText = `
        width: 24px;
        height: 24px;
        background-color: ${markerColor};
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        cursor: pointer;
      `;

      const marker = new window.google.maps.marker.AdvancedMarkerElement({
        position,
        map: mapInstanceRef.current,
        title: property.name,
        content: pinElement,
      });

      const mainImage = property.images?.[0];
      const imageHtml = mainImage 
        ? `<img src="${mainImage}" alt="${property.name}" style="width: 100%; height: 100px; object-fit: cover; border-radius: 6px; margin-bottom: 8px;" />`
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
        infoWindow.open({
          anchor: marker,
          map: mapInstanceRef.current,
        });
      });

      markersRef.current.push(marker);
    });

    // Fit map to show all markers
    if (filteredProperties.length > 1) {
      mapInstanceRef.current.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
    } else if (filteredProperties.length === 1) {
      mapInstanceRef.current.setCenter(bounds.getCenter());
      mapInstanceRef.current.setZoom(12);
    }
  }, [mapsLoaded, filteredProperties, typeColors]);

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
