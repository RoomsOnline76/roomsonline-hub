import { useEffect, useRef, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { MapPin } from "lucide-react";
import { useGoogleMapsApiKey } from "@/hooks/useFeatureFlags";

declare global {
  interface Window {
    google?: {
      maps: typeof google.maps;
    };
    initMap?: () => void;
  }
}

interface PropertyMapProps {
  address: string;
  suburb?: string;
  city: string;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
  onLocationUpdate?: (lat: number, lng: number) => void;
}

export function PropertyMap({ 
  address, 
  suburb,
  city, 
  country, 
  latitude, 
  longitude,
  onLocationUpdate 
}: PropertyMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [marker, setMarker] = useState<google.maps.marker.AdvancedMarkerElement | null>(null);
  const { apiKey, isLoading: apiKeyLoading } = useGoogleMapsApiKey();
  const [loading, setLoading] = useState(true);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  // Update loading state and show toast when api key is loaded from feature flags
  useEffect(() => {
    if (!apiKeyLoading) {
      if (!apiKey || apiKey.startsWith("placeholder_key_")) {
        toast({
          title: "Google Maps API Key Missing",
          description: "Please configure your Google Maps API key in the API Keys page.",
          variant: "destructive"
        });
      }
      setLoading(false);
    }
  }, [apiKeyLoading, apiKey]);

  // Load Google Maps script
  useEffect(() => {
    if (!apiKey || loading) return;

    if (window.google?.maps) {
      setMapsLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,marker`;
    script.async = true;
    script.defer = true;
    script.onload = () => setMapsLoaded(true);
    document.head.appendChild(script);

    return () => {
      // Cleanup if needed
    };
  }, [apiKey, loading]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || !mapsLoaded || !window.google?.maps) return;

    try {
      const initialPosition = latitude && longitude 
        ? { lat: Number(latitude), lng: Number(longitude) }
        : { lat: -33.9249, lng: 18.4241 }; // Default to Cape Town

      const newMap = new window.google.maps.Map(mapRef.current, {
        center: initialPosition,
        zoom: 15,
        mapTypeControl: true,
        streetViewControl: true,
        fullscreenControl: true,
        mapId: "PROPERTY_EDIT_MAP",
      });

      // Listen for authentication errors
      newMap.addListener("error", (e: any) => {
        console.error("Google Maps error:", e);
        setMapError("Map failed to load. Please check API key configuration.");
      });

      // Create custom draggable pin element
      const pinElement = document.createElement("div");
      pinElement.style.cssText = `
        width: 32px;
        height: 32px;
        background-color: #e11d48;
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        cursor: grab;
      `;

      const newMarker = new window.google.maps.marker.AdvancedMarkerElement({
        position: initialPosition,
        map: newMap,
        gmpDraggable: true,
        title: "Property Location",
        content: pinElement,
      });

      newMarker.addListener("dragend", () => {
        const position = newMarker.position;
        if (position && onLocationUpdate) {
          const lat = typeof position.lat === 'function' ? position.lat() : position.lat;
          const lng = typeof position.lng === 'function' ? position.lng() : position.lng;
          onLocationUpdate(lat, lng);
        }
      });

      setMap(newMap);
      setMarker(newMarker);
    } catch (error) {
      console.error("Failed to initialize Google Maps:", error);
      setMapError("Failed to initialize map. The API key may not be authorized for this domain.");
    }
  }, [mapsLoaded, latitude, longitude, onLocationUpdate]);

  // Geocode address when it changes
  useEffect(() => {
    if (!map || !marker || !address || !city || !country || !window.google?.maps) return;

    // Build full address: Street, Suburb (if present), City, Country
    const addressParts = [address];
    if (suburb) addressParts.push(suburb);
    addressParts.push(city, country);
    const fullAddress = addressParts.join(", ");
    
    const geocoder = new window.google.maps.Geocoder();

    geocoder.geocode({ address: fullAddress }, (results, status) => {
      if (status === "OK" && results && results[0]) {
        const location = results[0].geometry.location;
        map.setCenter(location);
        marker.position = { lat: location.lat(), lng: location.lng() };
        
        if (onLocationUpdate) {
          onLocationUpdate(location.lat(), location.lng());
        }
      } else {
        console.warn("Geocoding failed:", status);
      }
    });
  }, [address, suburb, city, country, map, marker, onLocationUpdate]);

  if (loading || (apiKey && !mapsLoaded)) {
    return (
      <div className="w-full h-full min-h-[200px] rounded-lg border border-border bg-muted flex items-center justify-center">
        <p className="text-muted-foreground text-xs">Loading map...</p>
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div className="w-full h-full min-h-[200px] rounded-lg border border-border bg-muted flex items-center justify-center">
        <div className="text-center space-y-2">
          <MapPin className="h-6 w-6 mx-auto text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Configure Google Maps API key
          </p>
        </div>
      </div>
    );
  }

  if (mapError) {
    return (
      <div className="w-full h-full min-h-[200px] rounded-lg border border-destructive/30 bg-destructive/5 flex items-center justify-center">
        <div className="text-center space-y-2 p-4">
          <MapPin className="h-6 w-6 mx-auto text-destructive" />
          <p className="text-xs text-destructive font-medium">Map Error</p>
          <p className="text-xs text-muted-foreground max-w-[200px]">
            {mapError}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={mapRef} 
      className="w-full h-full min-h-[200px] rounded-lg border border-border"
    />
  );
}
