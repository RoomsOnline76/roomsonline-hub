import React from "react";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, XCircle } from "lucide-react";

/**
 * The 15 minimum content requirements Rentals United enforces before a property
 * can be connected to sales channels. Each row resolves to one of three states:
 *
 *  - ok        the value is authored and pushed
 *  - default   a value is pushed, but it is a system fallback — confirm it
 *  - missing   nothing is pushed; channels can reject or hide the listing
 */
export interface RuContentFlags {
  has_name?: boolean;
  has_object_type_id?: boolean;
  can_sleep_max_ok?: boolean;
  has_floor?: boolean;
  floor_is_default?: boolean;
  has_space?: boolean;
  space_is_default?: boolean;
  has_street?: boolean;
  has_detailed_location_id?: boolean;
  has_zip_code?: boolean;
  has_coordinates?: boolean;
  amenities_count?: number;
  meets_minimum_amenities?: boolean;
  amenities_padded?: boolean;
  rooms_count?: number;
  total_beds?: number;
  max_guests?: number;
  beds_meet_max_guests?: boolean;
  has_description?: boolean;
  images_count?: number;
  meets_minimum_images?: boolean;
  has_main_image?: boolean;
  has_payment_methods?: boolean;
  payment_methods_is_default?: boolean;
  has_cancellation_policies?: boolean;
  cancellation_policies_is_default?: boolean;
}

type State = "ok" | "default" | "missing";

interface Row {
  label: string;
  field: string;
  where: string;
  state: State;
  detail?: string;
}

function buildRows(v: RuContentFlags): Row[] {
  const state = (ok: boolean | undefined, isDefault?: boolean): State =>
    ok === false ? "missing" : isDefault ? "default" : "ok";

  return [
    { label: "Property name", field: "Property/Name", where: "General", state: state(v.has_name) },
    {
      label: "Property type",
      field: "Property/ObjectTypeID",
      where: "General",
      state: state(v.has_object_type_id),
    },
    {
      label: "Maximum guests (min 1)",
      field: "Property/CanSleepMax",
      where: "Rooms",
      state: state(v.can_sleep_max_ok),
      detail: v.max_guests ? `${v.max_guests} guests` : undefined,
    },
    {
      label: "Floor number",
      field: "Property/Floor",
      where: "Info & Facilities → Property Info",
      state: state(v.has_floor, v.floor_is_default),
      detail: v.floor_is_default ? "Fallback 0 (ground) used" : undefined,
    },
    {
      label: "Property size",
      field: "Property/Space",
      where: "Info & Facilities → Property Info",
      state: state(v.has_space, v.space_is_default),
      detail: v.space_is_default ? "Fallback 50 m² used" : undefined,
    },
    {
      label: "Street address",
      field: "Property/Street",
      where: "Identity & Location",
      state: state(v.has_street),
    },
    {
      label: "Detailed location",
      field: "Properties/Property/DetailedLocationID",
      where: "Identity & Location → RU location",
      state: state(v.has_detailed_location_id),
    },
    {
      label: "ZIP / postal code",
      field: "Property/ZipCode",
      where: "Identity & Location",
      state: state(v.has_zip_code),
    },
    {
      label: "Geo-coordinates",
      field: "Property/Coordinates",
      where: "Identity & Location → Map",
      state: state(v.has_coordinates),
    },
    {
      label: "Amenities (min 10)",
      field: "Property/Amenities",
      where: "Info & Facilities",
      state: v.meets_minimum_amenities === false ? "missing" : v.amenities_padded ? "default" : "ok",
      detail:
        v.meets_minimum_amenities === false
          ? `${v.amenities_count ?? 0} of 10`
          : v.amenities_padded
            ? "Auto-filled to reach 10 — confirm"
            : `${v.amenities_count ?? 0} amenities`,
    },
    {
      label: "Rooms provided",
      field: "CompositionRoomsAmenities@CompositionRoomID",
      where: "Rooms",
      state: (v.rooms_count ?? 0) > 0 ? "ok" : "missing",
      detail: `${v.rooms_count ?? 0} rooms`,
    },
    {
      label: "Beds cover max guests",
      field: "CompositionRoomAmenities/Amenities",
      where: "Rooms → Beds",
      state: v.beds_meet_max_guests === false ? "default" : "ok",
      detail: `${v.total_beds ?? 0} beds / ${v.max_guests ?? 0} guests`,
    },
    {
      label: "Description",
      field: "Property/Descriptions",
      where: "Info & Facilities",
      state: state(v.has_description),
    },
    {
      label: "Photos (10+ at 1024×683, one main)",
      field: "Property/Images",
      where: "Images",
      state:
        v.meets_minimum_images === false ? "missing" : v.has_main_image === false ? "default" : "ok",
      detail:
        v.meets_minimum_images === false
          ? `${v.images_count ?? 0} of 10 verified`
          : v.has_main_image === false
            ? "No main photo flagged"
            : `${v.images_count ?? 0} images`,
    },
    {
      label: "Payment methods (min 1)",
      field: "Property/PaymentMethods",
      where: "Policies → Accepted payment methods",
      state: state(v.has_payment_methods, v.payment_methods_is_default),
      detail: v.payment_methods_is_default ? "Cash + card assumed — confirm" : undefined,
    },
    {
      label: "Cancellation policy (min 1)",
      field: "Property/CancellationPolicies",
      where: "Policies → Cancellation",
      state: state(v.has_cancellation_policies, v.cancellation_policies_is_default),
      detail: v.cancellation_policies_is_default ? "Standard default assumed — confirm" : undefined,
    },
  ];
}

export const RuChannelContentChecklist: React.FC<{ validation: RuContentFlags }> = ({ validation }) => {
  const rows = buildRows(validation);
  const missing = rows.filter((r) => r.state === "missing").length;
  const defaults = rows.filter((r) => r.state === "default").length;

  return (
    <div className="rounded-md border border-border">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Channel-connection content ({rows.length} requirements)
        </p>
        <div className="flex items-center gap-1">
          {missing > 0 && (
            <Badge variant="destructive" className="text-[10px] h-5">
              {missing} missing
            </Badge>
          )}
          {defaults > 0 && (
            <Badge variant="outline" className="text-[10px] h-5 border-primary text-primary">
              {defaults} unconfirmed
            </Badge>
          )}
          {missing === 0 && defaults === 0 && (
            <Badge variant="secondary" className="text-[10px] h-5">
              All confirmed
            </Badge>
          )}
        </div>
      </div>
      <div className="divide-y divide-border">
        {rows.map((r) => (
          <div key={r.field} className="flex items-start justify-between gap-2 px-3 py-1.5">
            <div className="flex items-start gap-2 min-w-0">
              {r.state === "ok" && <CheckCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-foreground" />}
              {r.state === "default" && (
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
              )}
              {r.state === "missing" && (
                <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-destructive" />
              )}
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{r.label}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {r.where} · {r.field}
                </p>
              </div>
            </div>
            {r.detail && (
              <span className="text-[10px] text-muted-foreground text-right shrink-0">{r.detail}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
