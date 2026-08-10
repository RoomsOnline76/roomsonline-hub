import { supabase } from "@/integrations/supabase/client";

/**
 * Static content delta to the Channel Manager.
 *
 * Rentals United requires static content (name, type, description, amenities, photos, bed
 * composition, location, policies) to be re-pushed whenever it changes in the PMS — the weekly
 * full refresh alone does not satisfy the White-Label certification requirement.
 *
 * Every save surface that persists static property content should call this after a successful
 * write. The edge function owns all channel logic (connectivity, pause state, fingerprint,
 * debounce), so a no-op save, an unlisted property or a paused listing costs nothing here.
 *
 * Fire-and-forget: never block a save on the channel round-trip and never surface a channel
 * failure as a save failure.
 */
export async function queueChannelContentSync(
  propertyId: string | null | undefined,
  trigger: string,
): Promise<void> {
  if (!propertyId) return;
  try {
    const { data, error } = await supabase.functions.invoke("ru-static-delta", {
      body: { property_id: propertyId, trigger },
    });
    if (error) {
      console.warn("[channel content sync] failed:", error.message);
      return;
    }
    if (data?.queued) {
      console.log(`[channel content sync] pushed content for ${propertyId} (${trigger})`);
    } else {
      console.log(`[channel content sync] skipped (${data?.reason ?? "unknown"}) for ${propertyId}`);
    }
  } catch (err) {
    console.warn("[channel content sync] error:", err);
  }
}
