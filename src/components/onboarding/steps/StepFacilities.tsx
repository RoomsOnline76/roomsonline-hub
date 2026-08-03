import RUAmenityPicker from "@/components/property/RUAmenityPicker";
import { ROLOS_ONLY_FACILITY_GROUPS } from "@/lib/rolosOnlyFacilities";
import { StepProps } from "./types";

/**
 * Property-level amenities & facilities.
 *
 * Driven by the live Rentals United amenity dictionary so whatever the owner selects
 * here is exactly what channels receive. RU's own "Popular amenities" lead the list,
 * followed by RU groups, the full searchable catalogue, and finally ROLOS-only
 * facilities that have no channel equivalent (website/showcase use only).
 */
export function StepFacilities({ updateField, getAmenityValue }: StepProps) {
  const facilities = getAmenityValue<string[]>("facilities", []);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Select everything available at the property. Channel amenities appear first — these are
        pushed to Rentals United and the OTAs, so start there before adding website-only extras.
      </p>

      <RUAmenityPicker
        scope="property"
        value={facilities}
        onChange={(next) => updateField("amenities.facilities", next)}
        extraGroups={ROLOS_ONLY_FACILITY_GROUPS}
      />
    </div>
  );
}
