import { useEffect, useRef, useState } from 'react';
import { useGoogleMapsApiKey } from '@/hooks/useFeatureFlags';
import { MapPin, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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

const ATTRACTION_COLORS = ['#D4AF37', '#A0A0A0', '#CD7F32', '#4DB6AC', '#7986CB'];

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

const TYPE_LABELS: Record<string, string> = {
  tourist_attraction: 'Attraction',
  natural_feature: 'Natural feature',
  park: 'Park & nature',
  museum: 'Museum',
  art_gallery: 'Art gallery',
  restaurant: 'Restaurant',
  cafe: 'Café',
  bar: 'Bar & nightlife',
  shopping_mall: 'Shopping',
  store: 'Shopping',
  church: 'Historic site',
  place_of_worship: 'Historic site',
  zoo: 'Wildlife',
  aquarium: 'Aquarium',
  amusement_park: 'Entertainment',
  spa: 'Spa & wellness',
  stadium: 'Sports venue',
  point_of_interest: 'Point of interest',
  establishment: 'Local spot',
};

function getPlaceTypeLabel(types?: string[]): string {
  if (!types?.length) return 'Nearby spot';
  for (const t of types) {
    if (TYPE_LABELS[t]) return TYPE_LABELS[t];
  }
  return 'Point of interest';
}

export function EmbedPortfolioMap({ properties, brandColor, onPropertyClick }: EmbedPortfolioMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const { apiKey, isLoading: keyLoading } = useGoogleMapsApiKey();
  const [attractions, setAttractions] = useState<google.maps.places.PlaceResult[]>([]);
  const attractionMarkersRef = useRef<google.maps.Marker[]>([]);
  const attractionInfoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  useEffect(() => {
    if (!apiKey || !mapRef.current || properties.length === 0) return;

    const init = async () => {
      if (!(window as any).google?.maps) {
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker,places&v=weekly`;
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
        disableDefaultUI: true,
        zoomControl: true,
        mapId: 'portfolio-map',
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

        // Label offset to the right of pin
        const labelWrapper = document.createElement('div');
        labelWrapper.style.cssText = `display:flex;flex-direction:column;align-items:flex-start;transform:translate(20px, -14px);pointer-events:none;`;
        const label = document.createElement('div');
        label.style.cssText = `
          background: ${brandColor};
          color: white;
          font-size: 11px;
          font-weight: 600;
          font-family: system-ui, sans-serif;
          padding: 3px 8px;
          border-radius: 10px;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0.92;
          box-shadow: 0 1px 4px rgba(0,0,0,0.2);
        `;
        label.textContent = prop.name;
        labelWrapper.appendChild(label);

        new AdvancedMarkerElement({
          map,
          position: { lat: prop.lat, lng: prop.lng },
          content: labelWrapper,
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

      // Fetch nearby attractions around portfolio center
      if (window.google?.maps?.places) {
        const center = bounds.getCenter();
        const service = new google.maps.places.PlacesService(map);

        const attractionsReq: google.maps.places.PlaceSearchRequest = {
          location: center,
          radius: 3000,
          type: 'tourist_attraction',
        };

        const eateryReq: google.maps.places.PlaceSearchRequest = {
          location: center,
          radius: 2000,
          type: 'restaurant',
        };

        let attractionResults: google.maps.places.PlaceResult[] = [];

        service.nearbySearch(attractionsReq, (results, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && results) {
            attractionResults = results
              .filter(r => r.rating && r.user_ratings_total && r.user_ratings_total >= 10)
              .sort((a, b) => (b.rating || 0) - (a.rating || 0))
              .slice(0, 4);
          }

          service.nearbySearch(eateryReq, (eateryResults, eateryStatus) => {
            let eatery: google.maps.places.PlaceResult | null = null;
            if (eateryStatus === google.maps.places.PlacesServiceStatus.OK && eateryResults) {
              eatery = eateryResults
                .filter(r => r.rating && r.rating >= 4.0 && r.user_ratings_total && r.user_ratings_total >= 20)
                .sort((a, b) => (b.rating || 0) - (a.rating || 0))[0] || null;
            }

            const combined = [...attractionResults];
            if (eatery) combined.push(eatery);
            setAttractions(combined);

            if (!attractionInfoWindowRef.current) {
              attractionInfoWindowRef.current = new google.maps.InfoWindow();
            }

            const extBounds = new google.maps.LatLngBounds();
            properties.forEach(p => extBounds.extend({ lat: p.lat, lng: p.lng }));

            combined.forEach((place, index) => {
              if (!place.geometry?.location) return;
              extBounds.extend(place.geometry.location);

              const typeLabel = getPlaceTypeLabel(place.types as string[]);

              const aMarker = new google.maps.Marker({
                position: place.geometry.location,
                map,
                title: place.name,
                icon: {
                  path: google.maps.SymbolPath.CIRCLE,
                  fillColor: ATTRACTION_COLORS[index],
                  fillOpacity: 0.9,
                  strokeColor: '#ffffff',
                  strokeWeight: 2,
                  scale: 8,
                },
                zIndex: 100 + index,
              });

              const ratingStars = place.rating ? '★'.repeat(Math.round(place.rating)) : '';

              aMarker.addListener('click', () => {
                attractionInfoWindowRef.current?.setContent(`
                  <div style="font-family:system-ui,sans-serif;padding:8px 12px;max-width:220px;">
                    <p style="font-weight:600;font-size:13px;margin:0 0 2px;color:#111;">${place.name}</p>
                    <p style="font-size:11px;color:#666;margin:0 0 4px;">${typeLabel}</p>
                    <p style="font-size:12px;color:${ATTRACTION_COLORS[index]};margin:0 0 4px;">${ratingStars} ${place.rating?.toFixed(1) || ''}</p>
                    ${place.vicinity ? `<p style="font-size:11px;color:#888;margin:0 0 6px;">${place.vicinity}</p>` : ''}
                    <a href="https://www.google.com/maps/place/?q=place_id:${place.place_id}" target="_blank" style="font-size:11px;color:#0066cc;text-decoration:none;">View on Maps →</a>
                  </div>
                `);
                attractionInfoWindowRef.current?.open(map, aMarker);
              });

              attractionMarkersRef.current.push(aMarker);
            });

            if (combined.length > 0) {
              map.fitBounds(extBounds, 60);
            }
          });
        });
      }
    };

    init().catch(console.error);

    return () => {
      delete (window as any).__portfolioNav__;
      attractionMarkersRef.current.forEach(m => m.setMap(null));
      attractionMarkersRef.current = [];
    };
  }, [apiKey, properties, brandColor, onPropertyClick]);

  if (keyLoading || !apiKey) {
    return (
      <div className="w-full h-[300px] sm:h-[400px] bg-gray-100 rounded-xl flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (properties.length < 1) return null;

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
      {attractions.length > 0 && (
        <div className="mt-3 px-1">
          <p className="text-xs font-medium text-gray-500 mb-2">Nearby:</p>
          <TooltipProvider>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-500">
              {attractions.slice(0, 5).map((a, i) => {
                const typeLabel = getPlaceTypeLabel(a.types as string[]);
                return (
                  <Tooltip key={a.place_id || i}>
                    <TooltipTrigger asChild>
                      <span className="flex items-center gap-1.5 cursor-default">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: ATTRACTION_COLORS[i] }}
                        />
                        <span className="truncate max-w-[160px]">{a.name}</span>
                        {a.vicinity && (
                          <span className="text-gray-400 truncate max-w-[120px] hidden sm:inline">· {a.vicinity}</span>
                        )}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[240px]">
                      <p className="font-semibold text-xs">{a.name}</p>
                      <p className="text-xs text-gray-400">{typeLabel}</p>
                      {a.rating && (
                        <p className="text-xs" style={{ color: ATTRACTION_COLORS[i] }}>
                          {'★'.repeat(Math.round(a.rating))} {a.rating.toFixed(1)}
                          {a.user_ratings_total ? ` (${a.user_ratings_total})` : ''}
                        </p>
                      )}
                      {a.vicinity && <p className="text-xs text-gray-400 mt-0.5">{a.vicinity}</p>}
                      <a
                        href={`https://www.google.com/maps/place/?q=place_id:${a.place_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-500 mt-1 inline-block"
                      >
                        View on Maps →
                      </a>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>
        </div>
      )}
    </div>
  );
}
