/**
 * Channel location lock notice.
 *
 * Once any reservation has ever touched a published listing, the Channel Manager
 * permanently refuses a location move (wire status 310). That refusal is cached in
 * `ru_listing_location_locks` and replayed locally — retrying never helps.
 *
 * Staff editing the address need to understand what still publishes (street, postal
 * code, map link, coordinates as text) and what does not (the channel's own
 * geographic place record), so this renders a plain-language explanation instead of
 * silently dropping the change.
 */
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";

interface LocationLockRow {
  published_location_id: number | null;
  refused_location_id: number | null;
  refusal_count: number | null;
  updated_at: string | null;
}

export function ChannelLocationLockNotice({ propertyId }: { propertyId?: string | null }) {
  const [lock, setLock] = useState<LocationLockRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!propertyId) {
      setLock(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("ru_listing_location_locks")
        .select("published_location_id, refused_location_id, refusal_count, updated_at")
        .eq("property_id", propertyId)
        .maybeSingle();
      if (!cancelled) setLock((data as LocationLockRow) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  if (!lock) return null;

  const when = lock.updated_at ? new Date(lock.updated_at).toLocaleDateString() : null;

  return (
    <Alert className="border-warning bg-warning/10">
      <Lock className="h-4 w-4" />
      <AlertTitle className="text-xs">Channel Manager location is locked for this listing</AlertTitle>
      <AlertDescription className="text-xs space-y-1">
        <p>
          The Channel Manager refuses to move a published listing to a different town or
          place once reservations exist on it{when ? ` (last refused ${when})` : ""}. This
          is permanent for this listing — repeating the save will not change the outcome.
        </p>
        <p>
          <strong>Still publishes:</strong> street address, postal code, map link and the
          latitude/longitude you enter here.{" "}
          <strong>Does not publish:</strong> the channel's own place record
          {lock.published_location_id ? ` (still published as place ${lock.published_location_id})` : ""}
          {lock.refused_location_id ? `, so the requested place ${lock.refused_location_id} stays unapplied` : ""}.
        </p>
        <p>
          To distribute this property from its new town, retire this listing at the channel
          and publish it as a new one from the onboarding workspace.
        </p>
      </AlertDescription>
    </Alert>
  );
}
