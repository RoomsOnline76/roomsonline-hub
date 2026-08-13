import { LocalExperiencesManager } from "@/components/experiences/LocalExperiencesManager";

interface NearbyAttractionsPanelProps {
  propertyId?: string;
  propertyName: string;
  propertyCity?: string;
  propertyCountry?: string;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Nearby attractions capture surface used inside the Facilities tab
 * (Property Surroundings). Attractions with a distance are pushed to the
 * channel as Distances entries — recommended, never blocking.
 */
export function NearbyAttractionsPanel({
  propertyId,
  propertyName,
  propertyCity,
  propertyCountry,
  latitude,
  longitude,
}: NearbyAttractionsPanelProps) {
  if (!propertyId) {
    return (
      <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        Save the property first — nearby attractions are stored against the saved record.
      </div>
    );
  }

  return (
    <LocalExperiencesManager
      propertyId={propertyId}
      propertyName={propertyName}
      propertyCity={propertyCity}
      propertyCountry={propertyCountry}
      propertyLat={latitude ?? null}
      propertyLng={longitude ?? null}
      variant="compact"
    />
  );
}
