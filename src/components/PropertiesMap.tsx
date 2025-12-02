import { useEffect, useRef, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Loader2 } from "lucide-react";

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
}

interface PropertiesMapProps {
  enabledTypes?: Record<string, boolean>;
  typeColors?: Record<string, string>;
}

const DEFAULT_COLOR = "#e11d48";

export function PropertiesMap({ enabledTypes, typeColors }: PropertiesMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const navigate = useNavigate();

  // Fetch properties with coordinates
  useEffect(() => {
    const fetchProperties = async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, slug, latitude, longitude, city, country, price_per_night, property_type")
        .eq("is_active", true)
        .not("latitude", "is", null)
        .not("longitude", "is", null);

      if (!error && data) {
        setProperties(data);
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

  // Load Google Maps script
  useEffect(() => {
    if (!apiKey || loading) return;

    if (window.google?.maps) {
      setMapsLoaded(true);
      return;
    }

    // Check if script is already loading
    const existingScript = document.querySelector(`script[src*="maps.googleapis.com"]`);
    if (existingScript) {
      const checkLoaded = setInterval(() => {
        if (window.google?.maps) {
          setMapsLoaded(true);
          clearInterval(checkLoaded);
        }
      }, 100);
      return () => clearInterval(checkLoaded);
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
    script.async = true;
    script.onload = () => setMapsLoaded(true);
    script.onerror = () => console.error("Failed to load Google Maps");
    document.head.appendChild(script);
  }, [apiKey, loading]);

  // Filter properties based on enabled types - memoized to prevent infinite loops
  const filteredProperties = useMemo(() => {
    if (!enabledTypes) return properties;
    return properties.filter((p) => enabledTypes[p.property_type] !== false);
  }, [properties, enabledTypes]);

  // Initialize map once
  useEffect(() => {
    if (!mapRef.current || !mapsLoaded || !window.google?.maps || mapInstanceRef.current) return;

    mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
      center: { lat: -28.4793, lng: 24.6727 },
      zoom: 5,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      styles: [
        {
          featureType: "poi",
          elementType: "labels",
          stylers: [{ visibility: "off" }]
        }
      ]
    });
  }, [mapsLoaded]);

  // Update markers when filtered properties change
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google?.maps) return;

    // Clear existing markers
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    if (filteredProperties.length === 0) return;

    const bounds = new window.google.maps.LatLngBounds();
    
    filteredProperties.forEach((property) => {
      if (!property.latitude || !property.longitude) return;

      const position = { lat: Number(property.latitude), lng: Number(property.longitude) };
      bounds.extend(position);

      const markerColor = typeColors?.[property.property_type] || DEFAULT_COLOR;

      const marker = new window.google.maps.Marker({
        position,
        map: mapInstanceRef.current,
        title: property.name,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: markerColor,
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        }
      });

      const infoWindow = new window.google.maps.InfoWindow({
        content: `
          <div style="padding: 8px; max-width: 200px;">
            <h3 style="font-weight: 600; margin-bottom: 4px; color: #111;">${property.name}</h3>
            <p style="font-size: 12px; color: #666; margin-bottom: 8px;">${property.city}, ${property.country}</p>
            <a href="/property/${property.slug || property.id}" 
               style="display: inline-block; padding: 6px 12px; background: #e11d48; color: white; border-radius: 6px; text-decoration: none; font-size: 12px;">
              View Property
            </a>
          </div>
        `
      });

      marker.addListener("click", () => {
        infoWindow.open(mapInstanceRef.current, marker);
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
  }, [filteredProperties, typeColors]);

  if (loading) {
    return (
      <div className="w-full h-[400px] rounded-xl border border-border bg-muted flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div className="w-full h-[400px] rounded-xl border border-border bg-muted flex items-center justify-center">
        <div className="text-center space-y-2">
          <MapPin className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Map unavailable</p>
        </div>
      </div>
    );
  }

  if (properties.length === 0 && mapsLoaded) {
    return (
      <div className="w-full h-[400px] rounded-xl border border-border bg-muted flex items-center justify-center">
        <div className="text-center space-y-2">
          <MapPin className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No properties with locations available</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={mapRef} 
      className="w-full h-[400px] rounded-xl border border-border shadow-lg"
    />
  );
}
