import { useEffect, useRef } from 'react';
import { useGoogleMapsApiKey } from '@/hooks/useFeatureFlags';
import { MapPin, Loader2 } from 'lucide-react';

interface MapProperty {
  name: string;
  slug: string;
  lat: number;
  lng: number;
  heroImage?: string | null;
}

interface EmbedPortfolioMapProps {
  properties: MapProperty[];
  brandColor: string;
  onPropertyClick: (slug: string) => void;
}

const mapStyles = [
  { elementType: "geometry", stylers: [{ saturation: -100 }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f5" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#eeeeee" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#dadada" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9c9c9" }] },
];

export function EmbedPortfolioMap({ properties, brandColor, onPropertyClick }: EmbedPortfolioMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const { apiKey, isLoading: keyLoading } = useGoogleMapsApiKey();

  useEffect(() => {
    if (!apiKey || !mapRef.current || properties.length === 0) return;

    const init = async () => {
      if (!(window as any).google?.maps) {
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker&v=weekly`;
        script.async = true;
        await new Promise<void>((res, rej) => {
          script.onload = () => res();
          script.onerror = rej;
          document.head.appendChild(script);
        });
      }

      const { Map } = await google.maps.importLibrary("maps") as google.maps.MapsLibrary;
      const { AdvancedMarkerElement } = await google.maps.importLibrary("marker") as google.maps.MarkerLibrary;

      const bounds = new google.maps.LatLngBounds();
      properties.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }));

      const map = new Map(mapRef.current!, {
        center: bounds.getCenter(),
        zoom: 12,
        mapId: 'portfolio-map',
        disableDefaultUI: true,
        zoomControl: true,
        styles: mapStyles as any,
      });
      map.fitBounds(bounds, 60);
      mapInstanceRef.current = map;

      let openInfoWindow: google.maps.InfoWindow | null = null;

      properties.forEach(prop => {
        const pin = document.createElement('div');
        pin.style.cssText = `width:32px;height:32px;border-radius:50%;background:${brandColor};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;display:flex;align-items:center;justify-content:center;`;
        pin.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;

        const marker = new AdvancedMarkerElement({
          map,
          position: { lat: prop.lat, lng: prop.lng },
          content: pin,
          title: prop.name,
        });

        const infoContent = `
          <div style="font-family:system-ui;min-width:180px;max-width:240px;">
            ${prop.heroImage ? `<img src="${prop.heroImage}" style="width:100%;height:100px;object-fit:cover;border-radius:6px 6px 0 0;"/>` : ''}
            <div style="padding:10px;">
              <div style="font-weight:600;font-size:14px;color:#1a1a1a;">${prop.name}</div>
              <button onclick="window.__portfolioNav__('${prop.slug}')" style="margin-top:8px;padding:4px 12px;font-size:12px;background:${brandColor};color:white;border:none;border-radius:6px;cursor:pointer;font-weight:500;">View & Book</button>
            </div>
          </div>`;

        const infoWindow = new google.maps.InfoWindow({ content: infoContent });

        marker.addListener('click', () => {
          openInfoWindow?.close();
          infoWindow.open({ anchor: marker, map });
          openInfoWindow = infoWindow;
        });
      });

      (window as any).__portfolioNav__ = (slug: string) => onPropertyClick(slug);
      // Map initialized
    };

    init().catch(console.error);

    return () => {
      delete (window as any).__portfolioNav__;
    };
  }, [apiKey, properties, brandColor, onPropertyClick]);

  if (keyLoading || !apiKey) {
    return (
      <div className="w-full h-[300px] sm:h-[400px] bg-gray-100 rounded-xl flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (properties.length < 2) return null;

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-3">
        <MapPin className="h-4 w-4" style={{ color: brandColor }} />
        <h2 className="text-sm font-semibold text-gray-900">Our Locations</h2>
      </div>
      <div
        ref={mapRef}
        className="w-full h-[300px] sm:h-[400px] rounded-xl overflow-hidden border border-gray-200"
      />
    </div>
  );
}
