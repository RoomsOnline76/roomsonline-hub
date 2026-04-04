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
const GOOGLE_MAPS_SCRIPT_ID = 'google-maps-embed-portfolio-script';

const mapStyles = [
  { elementType: 'geometry', stylers: [{ saturation: -100 }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9c9c9' }] },
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createPropertyMarkerIcon(name: string, brandColor: string) {
  const safeName = escapeHtml(name);
  const labelWidth = Math.max(92, Math.min(240, name.length * 7 + 24));
  const width = 48 + labelWidth;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="32" viewBox="0 0 ${width} 32">
      <circle cx="16" cy="16" r="14" fill="${brandColor}" stroke="#ffffff" stroke-width="3" />
      <path d="M16 8.5c-2.485 0-4.5 2.015-4.5 4.5c0 3.375 4.5 8 4.5 8s4.5-4.625 4.5-8c0-2.485-2.015-4.5-4.5-4.5zm0 6.2a1.7 1.7 0 1 1 0-3.4a1.7 1.7 0 0 1 0 3.4z" fill="#ffffff"/>
      <rect x="40" y="4" width="${labelWidth}" height="24" rx="12" fill="${brandColor}" fill-opacity="0.94" />
      <text x="52" y="20" fill="#ffffff" font-size="11" font-weight="600" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">${safeName}</text>
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(width, 32),
    anchor: new google.maps.Point(16, 16),
  };
}

async function loadGoogleMapsScript(apiKey: string) {
  if (window.google?.maps) return;

  const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;
  if (existingScript) {
    if (existingScript.dataset.loaded === 'true') return;

    await new Promise<void>((resolve, reject) => {
      const handleLoad = () => {
        existingScript.dataset.loaded = 'true';
        resolve();
      };
      const handleError = () => reject(new Error('Failed to load Google Maps script'));

      existingScript.addEventListener('load', handleLoad, { once: true });
      existingScript.addEventListener('error', handleError, { once: true });
    });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load Google Maps script'));
    document.head.appendChild(script);
  });
}

function buildPropertyInfoContent(prop: MapProperty, brandColor: string, onNavigate: () => void) {
  const container = document.createElement('div');
  container.style.cssText = 'font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;min-width:180px;max-width:240px;';

  if (prop.heroImage) {
    const image = document.createElement('img');
    image.src = prop.heroImage;
    image.alt = prop.name;
    image.style.cssText = 'width:100%;height:100px;object-fit:cover;border-radius:6px 6px 0 0;display:block;';
    container.appendChild(image);
  }

  const body = document.createElement('div');
  body.style.cssText = 'padding:10px;';

  const title = document.createElement('div');
  title.textContent = prop.name;
  title.style.cssText = 'font-weight:600;font-size:14px;color:#1a1a1a;';
  body.appendChild(title);

  const button = document.createElement('button');
  button.textContent = 'View & Book';
  button.type = 'button';
  button.style.cssText = `margin-top:8px;padding:4px 12px;font-size:12px;background:${brandColor};color:white;border:none;border-radius:6px;cursor:pointer;font-weight:500;`;
  button.addEventListener('click', onNavigate);
  body.appendChild(button);

  container.appendChild(body);
  return container;
}

export function EmbedPortfolioMap({ properties, brandColor, onPropertyClick }: EmbedPortfolioMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const propertyMarkersRef = useRef<google.maps.Marker[]>([]);
  const { apiKey, isLoading: keyLoading, isReady: apiKeyReady } = useGoogleMapsApiKey();
  const onPropertyClickRef = useRef(onPropertyClick);
  const [attractions, setAttractions] = useState<google.maps.places.PlaceResult[]>([]);
  const [mapError, setMapError] = useState<string | null>(null);
  const attractionMarkersRef = useRef<google.maps.Marker[]>([]);
  const attractionInfoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  useEffect(() => {
    onPropertyClickRef.current = onPropertyClick;
  }, [onPropertyClick]);

  useEffect(() => {
    const mapElement = mapRef.current;
    if (!apiKeyReady || !apiKey || !mapElement || properties.length === 0) return;

    let cancelled = false;
    const previousAuthFailure = (window as Window & { gm_authFailure?: () => void }).gm_authFailure;

    (window as Window & { gm_authFailure?: () => void }).gm_authFailure = () => {
      if (!cancelled) {
        setMapError('Google Maps could not be authorized for this site.');
      }
      previousAuthFailure?.();
    };

    const init = async () => {
      try {
        setMapError(null);
        await loadGoogleMapsScript(apiKey);
        if (cancelled || !window.google?.maps) return;

        // Ensure core libraries are loaded (importLibrary exists only with async bootstrap)
        if (typeof google.maps.importLibrary === 'function') {
          await google.maps.importLibrary('maps');
          await google.maps.importLibrary('places');
          if (cancelled) return;
        }

        // Wait for LatLngBounds to be available (legacy script may still be loading)
        if (typeof google.maps.LatLngBounds !== 'function') {
          await new Promise<void>(resolve => { setTimeout(resolve, 500); });
        }
        if (cancelled || typeof google.maps.LatLngBounds !== 'function') return;

        const bounds = new google.maps.LatLngBounds();
        properties.forEach((property) => bounds.extend({ lat: property.lat, lng: property.lng }));

        const center = bounds.getCenter();
        const map = new google.maps.Map(mapElement, {
          center,
          zoom: properties.length === 1 ? 14 : 12,
          disableDefaultUI: true,
          zoomControl: true,
          streetViewControl: false,
          fullscreenControl: false,
          mapTypeControl: false,
          styles: mapStyles,
        });

        if (properties.length === 1) {
          map.setCenter({ lat: properties[0].lat, lng: properties[0].lng });
          map.setZoom(14);
        } else {
          map.fitBounds(bounds, 60);
        }

        mapInstanceRef.current = map;

        let openInfoWindow: google.maps.InfoWindow | null = null;

        properties.forEach((prop) => {
          const marker = new google.maps.Marker({
            map,
            position: { lat: prop.lat, lng: prop.lng },
            title: prop.name,
            icon: createPropertyMarkerIcon(prop.name, brandColor),
            zIndex: 200,
          });

          propertyMarkersRef.current.push(marker);

          const infoWindow = new google.maps.InfoWindow({
            content: buildPropertyInfoContent(prop, brandColor, () => onPropertyClickRef.current(prop.slug)),
          });

          marker.addListener('click', () => {
            openInfoWindow?.close();
            infoWindow.open({ anchor: marker, map });
            openInfoWindow = infoWindow;
          });
        });

        if (window.google?.maps?.places) {
          try {
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
              if (cancelled) return;

              if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                attractionResults = results
                  .filter((result) => result.rating && result.user_ratings_total && result.user_ratings_total >= 10)
                  .sort((a, b) => (b.rating || 0) - (a.rating || 0))
                  .slice(0, 4);
              }

              service.nearbySearch(eateryReq, (eateryResults, eateryStatus) => {
                if (cancelled) return;

                let eatery: google.maps.places.PlaceResult | null = null;
                if (eateryStatus === google.maps.places.PlacesServiceStatus.OK && eateryResults) {
                  eatery =
                    eateryResults
                      .filter((result) => result.rating && result.rating >= 4.0 && result.user_ratings_total && result.user_ratings_total >= 20)
                      .sort((a, b) => (b.rating || 0) - (a.rating || 0))[0] || null;
                }

                const combined = [...attractionResults];
                if (eatery) combined.push(eatery);
                setAttractions(combined);

                if (!attractionInfoWindowRef.current) {
                  attractionInfoWindowRef.current = new google.maps.InfoWindow();
                }

                const extendedBounds = new google.maps.LatLngBounds();
                properties.forEach((property) => extendedBounds.extend({ lat: property.lat, lng: property.lng }));

                combined.forEach((place, index) => {
                  if (!place.geometry?.location) return;
                  extendedBounds.extend(place.geometry.location);

                  const typeLabel = getPlaceTypeLabel(place.types as string[]);

                  const attractionMarker = new google.maps.Marker({
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

                  attractionMarker.addListener('click', () => {
                    attractionInfoWindowRef.current?.setContent(`
                      <div style="font-family:system-ui,sans-serif;padding:8px 12px;max-width:220px;">
                        <p style="font-weight:600;font-size:13px;margin:0 0 2px;color:#111;">${escapeHtml(place.name || 'Nearby spot')}</p>
                        <p style="font-size:11px;color:#666;margin:0 0 4px;">${escapeHtml(typeLabel)}</p>
                        <p style="font-size:12px;color:${ATTRACTION_COLORS[index]};margin:0 0 4px;">${ratingStars} ${place.rating?.toFixed(1) || ''}</p>
                        ${place.vicinity ? `<p style="font-size:11px;color:#888;margin:0 0 6px;">${escapeHtml(place.vicinity)}</p>` : ''}
                        ${place.place_id ? `<a href="https://www.google.com/maps/place/?q=place_id:${place.place_id}" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:#0066cc;text-decoration:none;">View on Maps →</a>` : ''}
                      </div>
                    `);
                    attractionInfoWindowRef.current?.open(map, attractionMarker);
                  });

                  attractionMarkersRef.current.push(attractionMarker);
                });

                if (combined.length > 0 && properties.length > 1) {
                  map.fitBounds(extendedBounds, 60);
                }
              });
            });
          } catch (error) {
            console.warn('Nearby places could not be loaded for the portfolio map.', error);
            setAttractions([]);
          }
        }
      } catch (error) {
        console.error('Failed to initialize portfolio map:', error);
        if (!cancelled) {
          setMapError('Failed to load the map.');
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      (window as Window & { gm_authFailure?: () => void }).gm_authFailure = previousAuthFailure;
      propertyMarkersRef.current.forEach((marker) => marker.setMap(null));
      propertyMarkersRef.current = [];
      attractionMarkersRef.current.forEach((marker) => marker.setMap(null));
      attractionMarkersRef.current = [];
      attractionInfoWindowRef.current?.close();
      attractionInfoWindowRef.current = null;
      mapInstanceRef.current = null;
      setAttractions([]);
      mapElement.innerHTML = '';
    };
  }, [apiKey, apiKeyReady, properties, brandColor]);

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

      {mapError ? (
        <div className="w-full h-[300px] sm:h-[400px] rounded-xl border border-border bg-muted/40 flex items-center justify-center px-6 text-center">
          <div className="space-y-2">
            <MapPin className="h-6 w-6 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Map unavailable</p>
            <p className="text-xs text-muted-foreground">{mapError}</p>
          </div>
        </div>
      ) : (
        <div
          ref={mapRef}
          className="w-full h-[300px] sm:h-[400px] rounded-xl overflow-hidden border border-gray-200"
        />
      )}

      {attractions.length > 0 && !mapError && (
        <div className="mt-3 px-1">
          <p className="text-xs font-medium text-gray-500 mb-2">Nearby:</p>
          <TooltipProvider>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-500">
              {attractions.slice(0, 5).map((attraction, index) => {
                const typeLabel = getPlaceTypeLabel(attraction.types as string[]);
                return (
                  <Tooltip key={attraction.place_id || index}>
                    <TooltipTrigger asChild>
                      <span className="flex items-center gap-1.5 cursor-default">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: ATTRACTION_COLORS[index] }}
                        />
                        <span className="truncate max-w-[160px]">{attraction.name}</span>
                        {attraction.vicinity && (
                          <span className="text-gray-400 truncate max-w-[120px] hidden sm:inline">· {attraction.vicinity}</span>
                        )}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[240px]">
                      <p className="font-semibold text-xs">{attraction.name}</p>
                      <p className="text-xs text-gray-400">{typeLabel}</p>
                      {attraction.rating && (
                        <p className="text-xs" style={{ color: ATTRACTION_COLORS[index] }}>
                          {'★'.repeat(Math.round(attraction.rating))} {attraction.rating.toFixed(1)}
                          {attraction.user_ratings_total ? ` (${attraction.user_ratings_total})` : ''}
                        </p>
                      )}
                      {attraction.vicinity && <p className="text-xs text-gray-400 mt-0.5">{attraction.vicinity}</p>}
                      {attraction.place_id && (
                        <a
                          href={`https://www.google.com/maps/place/?q=place_id:${attraction.place_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 mt-1 inline-block"
                        >
                          View on Maps →
                        </a>
                      )}
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
