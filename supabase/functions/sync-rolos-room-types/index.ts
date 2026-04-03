// ============================================================================
// SYNC ROL'OS ROOM TYPES — Daily Safety Net
// Ensures rolos_room_types ↔ hostfully_room_types parity
// Auto-creates missing rolos_rooms entries
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    console.log("[sync-rolos-room-types] Starting daily sync");

    // Get all active ROL properties
    const { data: properties, error: propErr } = await supabase
      .from("properties")
      .select("id, name, amenities")
      .eq("is_rol_property", true)
      .eq("is_active", true);

    if (propErr || !properties?.length) {
      return new Response(JSON.stringify({ success: true, message: "No ROL properties to sync" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Record<string, unknown> = {};

    for (const property of properties) {
      try {
        // Get existing rolos_room_types
        const { data: rolosTypes } = await supabase
          .from("rolos_room_types")
          .select("id, name, linked_overview_id")
          .eq("property_id", property.id);

        // Get hostfully_room_types (overview source)
        const { data: overviewTypes } = await supabase
          .from("hostfully_room_types")
          .select("id, name, linked_rolos_id, max_guests, daily_rate, amenities, images, is_active")
          .eq("property_id", property.id);

        const rolosNameMap = new Map((rolosTypes || []).map(t => [t.name.trim().toLowerCase(), t]));

        let typesCreated = 0;
        let roomsCreated = 0;

        // Sync overview → rolos (create missing — but match by name first to prevent duplicates)
        for (const ovType of (overviewTypes || [])) {
          // Skip if already linked
          if (ovType.linked_rolos_id) continue;

          // Check if a rolos type already exists with the same name
          const existingByName = rolosNameMap.get(ovType.name.trim().toLowerCase());
          if (existingByName) {
            // Link existing rolos type instead of creating a duplicate
            await supabase.from("hostfully_room_types").update({ linked_rolos_id: existingByName.id }).eq("id", ovType.id);
            console.log(`[sync-rolos-room-types] Linked existing '${existingByName.name}' to overview ${ovType.id}`);
            continue;
          }

          // Only create if truly missing
          const { data: newType } = await supabase.from("rolos_room_types").insert({
            property_id: property.id,
            name: ovType.name,
            max_occupancy: ovType.max_guests || 2,
            default_rate: ovType.daily_rate,
            amenities: ovType.amenities,
            images: ovType.images,
            is_active: ovType.is_active ?? true,
            linked_overview_id: ovType.id,
          }).select("id").single();

          if (newType) {
            await supabase.from("hostfully_room_types").update({ linked_rolos_id: newType.id }).eq("id", ovType.id);
            typesCreated++;
          }
        }

        // Auto-create physical rooms for room types that have none
        const { data: allRolosTypes } = await supabase
          .from("rolos_room_types")
          .select("id, name")
          .eq("property_id", property.id)
          .eq("is_active", true);

        for (const rt of (allRolosTypes || [])) {
          const { count } = await supabase.from("rolos_rooms")
            .select("id", { count: "exact", head: true })
            .eq("room_type_id", rt.id)
            .eq("property_id", property.id);

          if (!count || count === 0) {
            // Create one default room
            await supabase.from("rolos_rooms").insert({
              property_id: property.id,
              room_type_id: rt.id,
              room_number: `${rt.name}-1`,
              room_name: rt.name,
              status: "available",
            });
            roomsCreated++;
          }
        }

        results[property.id] = { types_created: typesCreated, rooms_created: roomsCreated };
      } catch (err) {
        console.error(`[sync-rolos-room-types] Error for property ${property.id}:`, err);
        results[property.id] = { error: String(err) };
      }
    }

    console.log("[sync-rolos-room-types] Sync completed:", JSON.stringify(results));

    return new Response(
      JSON.stringify({ success: true, properties_synced: properties.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[sync-rolos-room-types] Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
