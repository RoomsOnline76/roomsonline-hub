import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useGoogleMapsApiKey } from "@/hooks/useFeatureFlags";

const GOOGLE_MAPS_SCRIPT_SELECTOR = 'script[src*="maps.googleapis.com/maps/api/js"]';

async function waitForGoogleMaps(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.google?.maps && typeof window.google.maps.importLibrary === "function") return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for Google Maps to initialize");
}

async function loadGoogleMapsScript(apiKey: string) {
  if (window.google?.maps && typeof window.google.maps.importLibrary === "function") return;

  const existing = document.querySelector<HTMLScriptElement>(GOOGLE_MAPS_SCRIPT_SELECTOR);
  if (existing) {
    await waitForGoogleMaps();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async&v=weekly&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps script"));
    document.head.appendChild(script);
  });

  await waitForGoogleMaps();
}

/** Straight-line distance in km, one decimal. */
export function haversineKm(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) ** 2;
  const d = 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  return Math.round(d * 10) / 10;
}

export interface PickedPlace {
  title: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number | null;
  primaryType?: string;
}

interface Suggestion {
  label: string;
  secondary?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  place: any;
}

interface AttractionPlaceSearchProps {
  propertyLat?: number | null;
  propertyLng?: number | null;
  /** Bias the search around the property's town when coordinates are missing. */
  regionHint?: string;
  onPick: (place: PickedPlace) => void;
}

export function AttractionPlaceSearch({
  propertyLat,
  propertyLng,
  regionHint,
  onPick,
}: AttractionPlaceSearchProps) {
  const { apiKey, isReady } = useGoogleMapsApiKey();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionTokenRef = useRef<any>(null);
  const debounceRef = useRef<number | null>(null);

  const runSearch = useCallback(
    async (input: string) => {
      if (!apiKey || input.trim().length < 3) {
        setSuggestions([]);
        return;
      }
      setIsSearching(true);
      setError(null);
      try {
        await loadGoogleMapsScript(apiKey);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const placesLib: any = await window.google!.maps.importLibrary("places");
        const { AutocompleteSuggestion, AutocompleteSessionToken } = placesLib;
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new AutocompleteSessionToken();
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const request: any = {
          input: regionHint ? `${input} ${regionHint}` : input,
          sessionToken: sessionTokenRef.current,
        };
        if (typeof propertyLat === "number" && typeof propertyLng === "number") {
          request.locationBias = {
            center: { lat: propertyLat, lng: propertyLng },
            radius: 50000,
          };
        }

        const { suggestions: raw } =
          await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);

        setSuggestions(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (raw ?? []).slice(0, 6).map((s: any) => ({
            label:
              s.placePrediction?.mainText?.text ??
              s.placePrediction?.text?.text ??
              "Unknown place",
            secondary: s.placePrediction?.secondaryText?.text,
            place: s.placePrediction,
          })),
        );
      } catch (err) {
        setSuggestions([]);
        setError(err instanceof Error ? err.message : "Place search unavailable");
      } finally {
        setIsSearching(false);
      }
    },
    [apiKey, propertyLat, propertyLng, regionHint],
  );

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = window.setTimeout(() => void runSearch(query), 350);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  const handleSelect = useCallback(
    async (suggestion: Suggestion) => {
      setSuggestions([]);
      setQuery("");
      sessionTokenRef.current = null;
      try {
        const place = suggestion.place?.toPlace?.();
        if (place) {
          await place.fetchFields({
            fields: ["displayName", "formattedAddress", "location", "primaryType"],
          });
          const lat = place.location?.lat?.();
          const lng = place.location?.lng?.();
          const distanceKm =
            typeof lat === "number" &&
            typeof lng === "number" &&
            typeof propertyLat === "number" &&
            typeof propertyLng === "number"
              ? haversineKm(propertyLat, propertyLng, lat, lng)
              : null;
          onPick({
            title: place.displayName ?? suggestion.label,
            address: place.formattedAddress ?? suggestion.secondary,
            latitude: lat,
            longitude: lng,
            distanceKm,
            primaryType: place.primaryType ?? undefined,
          });
          return;
        }
      } catch {
        // fall through to the label-only pick below
      }
      onPick({ title: suggestion.label, address: suggestion.secondary, distanceKm: null });
    },
    [onPick, propertyLat, propertyLng],
  );

  if (isReady && !apiKey) {
    return (
      <p className="text-xs text-muted-foreground">
        Map search is unavailable — add attractions manually below.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a nearby attraction, beach, restaurant…"
          className="h-8 pl-7 text-xs"
        />
        {isSearching && (
          <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {suggestions.length > 0 && (
        <div className="rounded-md border bg-popover">
          {suggestions.map((s, i) => (
            <Button
              key={`${s.label}-${i}`}
              type="button"
              variant="ghost"
              className="h-auto w-full justify-start gap-2 px-2 py-1.5 text-left"
              onClick={() => void handleSelect(s)}
            >
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium">{s.label}</span>
                {s.secondary && (
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {s.secondary}
                  </span>
                )}
              </span>
            </Button>
          ))}
        </div>
      )}

      {typeof propertyLat !== "number" || typeof propertyLng !== "number" ? (
        <p className="text-[11px] text-muted-foreground">
          Set the property coordinates to have distances calculated automatically.
        </p>
      ) : null}
    </div>
  );
}
