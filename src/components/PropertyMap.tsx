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
    gm_authFailure?: () => void;
  }
}

const GOOGLE_MAPS_SCRIPT_SELECTOR = 'script[src*="maps.googleapis.com/maps/api/js"]';

async function waitForGoogleMaps(timeoutMs = 8000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (window.google?.maps && typeof window.google.maps.Map === "function") {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Timed out waiting for Google Maps to initialize");
}

async function loadGoogleMapsScript(apiKey: string) {
  if (window.google?.maps && typeof window.google.maps.Map === "function") return;

  const existingScript = document.querySelector<HTMLScriptElement>(GOOGLE_MAPS_SCRIPT_SELECTOR);
  if (existingScript) {
    await waitForGoogleMaps();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps script"));
    document.head.appendChild(script);
  });

  await waitForGoogleMaps();
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
  const markerInstanceRef = useRef<google.maps.Marker | null>(null);
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
    const previousAuthFailure = window.gm_authFailure;

    window.gm_authFailure = () => {
      if (!cancelled) {
        setMapsLoaded(false);
        setMapError("Google Maps could not be authorized for this site.");
      }
      previousAuthFailure?.();
    };

    const initializeMap = async () => {
      setMapError(null);
      setMapsLoaded(false);

      await loadGoogleMapsScript(apiKey);
      if (cancelled || !mapRef.current || !window.google?.maps) return;

      if (typeof google.maps.importLibrary === "function") {
        await google.maps.importLibrary("maps");
        if (cancelled) return;
      }

      const initialPosition = latitude != null && longitude != null
        ? { lat: Number(latitude), lng: Number(longitude) }
        : { lat: -33.9249, lng: 18.4241 };

      const newMap = new google.maps.Map(mapRef.current, {
        center: initialPosition,
        zoom: 15,
        mapTypeControl: true,
        streetViewControl: true,
        fullscreenControl: true,
      });

      const newMarker = new google.maps.Marker({
        position: initialPosition,
        map: newMap,
        draggable: true,
        title: "Property Location",
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#e91e8c",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
      });

      newMarker.addListener("dragend", () => {
        const position = newMarker.getPosition();
        if (position && onLocationUpdateRef.current) {
          onLocationUpdateRef.current(position.lat(), position.lng());
        }
      });

      mapInstanceRef.current = newMap;
      markerInstanceRef.current = newMarker;
      setMapsLoaded(true);
      setIsInitialized(true);
      setMapError(null);
    };

    const loadAndInit = async () => {
      try {
        await initializeMap();
      } catch (error) {
        if (cancelled) return;

        console.error("Failed to initialize Google Maps:", error);

        try {
          await new Promise((resolve) => setTimeout(resolve, 500));
          if (cancelled) return;
          await initializeMap();
        } catch (retryError) {
          console.error("Retry failed while initializing Google Maps:", retryError);
          if (!cancelled) {
            const message = retryError instanceof Error ? retryError.message.toLowerCase() : "";
            setMapsLoaded(false);
            setMapError(
              message.includes("authorize") || message.includes("referer")
                ? "Google Maps could not be authorized for this site."
                : "Failed to load the map. Please try again."
            );
          }
        }
      }
    };

    loadAndInit();
    return () => {
      cancelled = true;
      window.gm_authFailure = previousAuthFailure;
    };
  }, [apiKey, apiKeyReady, isInitialized]);

  // Update marker position when lat/lng props change (without reinitializing map)
  useEffect(() => {
    if (!isInitialized || !mapInstanceRef.current || !markerInstanceRef.current) return;
    if (latitude == null || longitude == null) return;

    const newPosition = { lat: Number(latitude), lng: Number(longitude) };
    mapInstanceRef.current.setCenter(newPosition);
    markerInstanceRef.current.setPosition(newPosition);
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
        marker.setPosition({ lat: location.lat(), lng: location.lng() });
        
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

  return (
    <div className="relative w-full h-full min-h-[200px]">
      <div
        ref={mapRef}
        className="w-full h-full min-h-[200px] rounded-lg border border-border"
      />
      {mapError ? (
        <div className="absolute inset-0 rounded-lg border border-destructive/30 bg-destructive/5 flex items-center justify-center">
          <div className="text-center space-y-2 p-4">
            <MapPin className="h-6 w-6 mx-auto text-destructive" />
            <p className="text-xs text-destructive font-medium">Map Error</p>
            <p className="text-xs text-muted-foreground max-w-[220px]">
              {mapError}
            </p>
          </div>
        </div>
      ) : (!apiKeyReady || !mapsLoaded) && (
        <div className="absolute inset-0 rounded-lg bg-muted/80 flex items-center justify-center pointer-events-none">
          <p className="text-muted-foreground text-xs">Loading map...</p>
        </div>
      )}
    </div>
  );
}
