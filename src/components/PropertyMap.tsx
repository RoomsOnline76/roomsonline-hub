import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { MapPin } from "lucide-react";

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
  city: string;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
  onLocationUpdate?: (lat: number, lng: number) => void;
}

export function PropertyMap({ 
  address, 
  city, 
  country, 
  latitude, 
  longitude,
  onLocationUpdate 
}: PropertyMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [marker, setMarker] = useState<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapsLoaded, setMapsLoaded] = useState(false);

  // Fetch Google Maps API key from database
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
        } else {
          toast({
            title: "Google Maps API Key Missing",
            description: "Please configure your Google Maps API key in the API Keys page.",
            variant: "destructive"
          });
        }
      } catch (error) {
        console.error("Error fetching API key:", error);
        toast({
          title: "Error",
          description: "Failed to load Google Maps API key.",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    fetchApiKey();
  }, []);

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
  }, [mapsLoaded, latitude, longitude, onLocationUpdate]);

  // Geocode address when it changes
  useEffect(() => {
    if (!map || !marker || !address || !city || !country || !window.google?.maps) return;

    const fullAddress = `${address}, ${city}, ${country}`;
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
  }, [address, city, country, map, marker, onLocationUpdate]);

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

  return (
    <div 
      ref={mapRef} 
      className="w-full h-full min-h-[200px] rounded-lg border border-border"
    />
  );
}
