import { useEffect, useRef, useState, useCallback } from "react";
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
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerInstanceRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const onLocationUpdateRef = useRef(onLocationUpdate);
  const { apiKey, isReady: apiKeyReady } = useGoogleMapsApiKey();
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Keep callback ref updated without triggering re-renders
  useEffect(() => {
    onLocationUpdateRef.current = onLocationUpdate;
  }, [onLocationUpdate]);

  // Show toast when API key is missing after loading completes
  useEffect(() => {
    if (apiKeyReady && (!apiKey || apiKey.startsWith("placeholder_key_"))) {
      toast({
        title: "Google Maps API Key Missing",
        description: "Please configure your Google Maps API key in the API Keys page.",
        variant: "destructive"
      });
    }
  }, [apiKeyReady, apiKey]);

  // Load Google Maps script and initialize map
  useEffect(() => {
    if (!apiKeyReady || !apiKey || apiKey.startsWith("placeholder_key_") || !mapRef.current || isInitialized) return;

    let cancelled = false;

    const loadAndInit = async () => {
      try {
        // Load script if not present
        if (!window.google?.maps) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async`;
            script.async = true;
            script.defer = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Failed to load Google Maps script"));
            document.head.appendChild(script);
          });
        }

        if (cancelled) return;

        // Import required libraries explicitly - this ensures they're fully loaded
        const [mapsLib, markerLib] = await Promise.all([
          google.maps.importLibrary("maps") as Promise<google.maps.MapsLibrary>,
          google.maps.importLibrary("marker") as Promise<google.maps.MarkerLibrary>,
        ]);

        if (cancelled || !mapRef.current) return;

        const initialPosition = latitude && longitude
          ? { lat: Number(latitude), lng: Number(longitude) }
          : { lat: -33.9249, lng: 18.4241 };

        const newMap = new mapsLib.Map(mapRef.current, {
          center: initialPosition,
          zoom: 15,
          mapTypeControl: true,
          streetViewControl: true,
          fullscreenControl: true,
          mapId: "PROPERTY_EDIT_MAP",
        });

        const pinElement = document.createElement("div");
        pinElement.style.cssText = `
          width: 32px; height: 32px;
          background-color: #e91e8c;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          cursor: grab;
        `;

        const newMarker = new markerLib.AdvancedMarkerElement({
          position: initialPosition,
          map: newMap,
          gmpDraggable: true,
          title: "Property Location",
          content: pinElement,
        });

        newMarker.addListener("dragend", () => {
          const position = newMarker.position;
          if (position && onLocationUpdateRef.current) {
            const lat = typeof position.lat === 'function' ? (position as any).lat() : (position as any).lat;
            const lng = typeof position.lng === 'function' ? (position as any).lng() : (position as any).lng;
            onLocationUpdateRef.current(lat, lng);
          }
        });

        mapInstanceRef.current = newMap;
        markerInstanceRef.current = newMarker;
        setMapsLoaded(true);
        setIsInitialized(true);
      } catch (error) {
        console.error("Failed to initialize Google Maps:", error);
        if (!cancelled) {
          setMapError("Failed to initialize map. The API key may not be authorized for this domain.");
        }
      }
    };

    loadAndInit();
    return () => { cancelled = true; };
  }, [apiKey, apiKeyReady, isInitialized]);

  // Update marker position when lat/lng props change (without reinitializing map)
  useEffect(() => {
    if (!isInitialized || !mapInstanceRef.current || !markerInstanceRef.current) return;
    if (!latitude || !longitude) return;

    const newPosition = { lat: Number(latitude), lng: Number(longitude) };
    mapInstanceRef.current.setCenter(newPosition);
    markerInstanceRef.current.position = newPosition;
  }, [latitude, longitude, isInitialized]);

  // Geocode address when it changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const marker = markerInstanceRef.current;
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
        
        if (onLocationUpdateRef.current) {
          onLocationUpdateRef.current(location.lat(), location.lng());
        }
      } else {
        console.warn("Geocoding failed:", status);
      }
    });
  }, [address, suburb, city, country, isInitialized]);

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
    <div className="relative w-full h-full min-h-[200px]">
      <div
        ref={mapRef}
        className="w-full h-full min-h-[200px] rounded-lg border border-border"
      />
      {(!apiKeyReady || !mapsLoaded) && (
        <div className="absolute inset-0 rounded-lg bg-muted/80 flex items-center justify-center pointer-events-none">
          <p className="text-muted-foreground text-xs">Loading map...</p>
        </div>
      )}
    </div>
  );
}
