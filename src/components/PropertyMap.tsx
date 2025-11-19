import { useEffect, useRef, useState } from "react";
import { toast } from "@/hooks/use-toast";

declare global {
  interface Window {
    google: typeof google;
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
  const [marker, setMarker] = useState<google.maps.Marker | null>(null);

  // Load Google Maps script
  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      toast({
        title: "Map Error",
        description: "Google Maps API key is missing.",
        variant: "destructive"
      });
      return;
    }

    if (window.google?.maps) {
      // Already loaded
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    return () => {
      // Cleanup if needed
    };
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || !window.google?.maps) return;

    const initialPosition = latitude && longitude 
      ? { lat: Number(latitude), lng: Number(longitude) }
      : { lat: -33.9249, lng: 18.4241 }; // Default to Cape Town

    const newMap = new window.google.maps.Map(mapRef.current, {
      center: initialPosition,
      zoom: 15,
      mapTypeControl: true,
      streetViewControl: true,
      fullscreenControl: true,
    });

    const newMarker = new window.google.maps.Marker({
      position: initialPosition,
      map: newMap,
      draggable: true,
      title: "Property Location"
    });

    newMarker.addListener("dragend", () => {
      const position = newMarker.getPosition();
      if (position && onLocationUpdate) {
        onLocationUpdate(position.lat(), position.lng());
      }
    });

    setMap(newMap);
    setMarker(newMarker);
  }, [window.google?.maps]);

  // Geocode address when it changes
  useEffect(() => {
    if (!map || !marker || !address || !city || !country || !window.google?.maps) return;

    const fullAddress = `${address}, ${city}, ${country}`;
    const geocoder = new window.google.maps.Geocoder();

    geocoder.geocode({ address: fullAddress }, (results, status) => {
      if (status === "OK" && results && results[0]) {
        const location = results[0].geometry.location;
        map.setCenter(location);
        marker.setPosition(location);
        
        if (onLocationUpdate) {
          onLocationUpdate(location.lat(), location.lng());
        }
      } else {
        console.warn("Geocoding failed:", status);
      }
    });
  }, [address, city, country, map, marker, onLocationUpdate]);

  return (
    <div className="space-y-2">
      <div 
        ref={mapRef} 
        className="w-full h-[400px] rounded-lg border border-border"
      />
      <p className="text-sm text-muted-foreground">
        Drag the marker to adjust the property location
      </p>
    </div>
  );
}
