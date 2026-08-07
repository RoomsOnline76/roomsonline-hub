// ============================================================================
// HYDRATE PMS CACHE → ROL'OS PIPELINE
// Bridges pms_availability_cache data into hostfully_room_types, rolos_rate_plans,
// rolos_rate_plan_room_types, and property_availability so the PMS Dashboard
// can display ARI from any adapter (Benson, HotelBeds, etc.)
// ============================================================================

import { canonicalPricingModel } from "../_shared/ratePricing.ts";
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
    const { property_id, system_type } = await req.json();
    if (!property_id || !system_type) {
      return new Response(JSON.stringify({ success: false, error: "property_id and system_type required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[hydrate] Starting for property=${property_id} system=${system_type}`);

    // ── 1. Discover distinct room types from cache ──
    const { data: cachedRows, error: cacheErr } = await supabase
      .from("pms_availability_cache")
      .select("external_room_type_id, date, available_units, rates, restrictions, raw_data")
      .eq("property_id", property_id)
      .eq("system_type", system_type)
      .order("date", { ascending: true });

    if (cacheErr) throw cacheErr;
    if (!cachedRows?.length) {
      return new Response(JSON.stringify({ success: true, message: "No cache data to hydrate" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by external_room_type_id
    const roomTypeMap = new Map<string, { name: string; rows: typeof cachedRows }>();
    for (const row of cachedRows) {
      const extId = row.external_room_type_id;
      if (!roomTypeMap.has(extId)) {
        const name = row.raw_data?.roomTypeName || row.raw_data?.room_type_name || `Room ${extId}`;
        roomTypeMap.set(extId, { name, rows: [] });
      }
      roomTypeMap.get(extId)!.rows.push(row);
    }

    let roomTypesCreated = 0;
    let ratePlansCreated = 0;
    let availabilityUpserted = 0;

    for (const [extId, { name, rows }] of roomTypeMap) {
      // ── 2. Upsert into hostfully_room_types (triggers sync_overview_to_rolos_room_types) ──
      // Check if already exists by external ID stored in raw_data
      const { data: existingHRT } = await supabase
        .from("hostfully_room_types")
        .select("id, linked_rolos_id")
        .eq("property_id", property_id)
        .eq("hostfully_room_id", `${system_type}:${extId}`)
        .maybeSingle();

      let overviewId: string;
      let rolosRoomTypeId: string | null = null;

      if (existingHRT) {
        overviewId = existingHRT.id;
        rolosRoomTypeId = existingHRT.linked_rolos_id;
        // Update name if changed
        await supabase.from("hostfully_room_types").update({ name, updated_at: new Date().toISOString() }).eq("id", overviewId);
      } else {
        // Get a representative rate for daily_rate
        const firstRate = rows.find(r => r.rates?.length > 0)?.rates?.[0];
        const dailyRate = firstRate?.room_amount || firstRate?.adult_amounts?.adultAmount1 || firstRate?.adult_amounts?.adult_amount_1 || null;

        const { data: newHRT, error: insertErr } = await supabase
          .from("hostfully_room_types")
          .insert({
            property_id,
            name,
            hostfully_room_id: `${system_type}:${extId}`,
            daily_rate: dailyRate,
            is_active: true,
            max_guests: 2,
            raw_data: { system_type, external_room_type_id: extId },
          })
          .select("id, linked_rolos_id")
          .single();

        if (insertErr) {
          console.error(`[hydrate] Error inserting room type ${extId}:`, insertErr);
          continue;
        }
        overviewId = newHRT.id;
        rolosRoomTypeId = newHRT.linked_rolos_id;
        roomTypesCreated++;
      }

      // If trigger didn't auto-create rolos_room_type, look it up
      if (!rolosRoomTypeId) {
        const { data: rolosRT } = await supabase
          .from("rolos_room_types")
          .select("id")
          .eq("linked_overview_id", overviewId)
          .maybeSingle();
        rolosRoomTypeId = rolosRT?.id || null;
      }

      // ── 3. Hydrate rates into rolos_rate_plans ──
      // Collect distinct rate types from all rows
      const rateTypeMap = new Map<string, { name: string; price_type: string; sample: any }>();
      for (const row of rows) {
        if (!row.rates || !Array.isArray(row.rates)) continue;
        for (const rate of row.rates) {
          const rtId = String(rate.rate_type_id || "default");
          if (!rateTypeMap.has(rtId)) {
            rateTypeMap.set(rtId, {
              name: rate.rate_type_name || `Rate ${rtId}`,
              price_type: rate.price_type || "UnitRate",
              sample: rate,
            });
          }
        }
      }

      for (const [rateExtId, { name: rateName, price_type, sample }] of rateTypeMap) {
        // Determine pricing model
        const pricingModel = canonicalPricingModel(price_type);

        // Determine base rate from sample
        const baseRate = sample.room_amount ||
          sample.adult_amounts?.adultAmount1 ||
          sample.adult_amounts?.adult_amount_1 ||
          0;

        const adult1 = sample.adult_amounts?.adultAmount1 || sample.adult_amounts?.adult_amount_1 || null;
        const adult2 = sample.adult_amounts?.adultAmount2 || sample.adult_amounts?.adult_amount_2 || null;

        // Check existing rate plan by code pattern
        const planCode = `${system_type}-${rateExtId}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
        
        const { data: existingPlan } = await supabase
          .from("rolos_rate_plans")
          .select("id")
          .eq("property_id", property_id)
          .eq("code", planCode)
          .maybeSingle();

        let ratePlanId: string;

        if (existingPlan) {
          ratePlanId = existingPlan.id;
          await supabase.from("rolos_rate_plans").update({
            name: rateName,
            base_rate: baseRate,
            pricing_model: pricingModel,
            adult_1_rate: adult1,
            adult_2_rate: adult2,
            teen_rate: sample.teen_amount || null,
            child_rate: sample.child_amount || null,
            infant_rate: sample.infant_amount || null,
            updated_at: new Date().toISOString(),
          }).eq("id", ratePlanId);
        } else {
          const { data: newPlan, error: planErr } = await supabase
            .from("rolos_rate_plans")
            .insert({
              property_id,
              name: rateName,
              code: planCode,
              base_rate: baseRate,
              pricing_model: pricingModel,
              is_active: true,
              adult_1_rate: adult1,
              adult_2_rate: adult2,
              teen_rate: sample.teen_amount || null,
              child_rate: sample.child_amount || null,
              infant_rate: sample.infant_amount || null,
            })
            .select("id")
            .single();

          if (planErr) {
            console.error(`[hydrate] Error creating rate plan ${planCode}:`, planErr);
            continue;
          }
          ratePlanId = newPlan.id;
          ratePlansCreated++;
        }

        // Link rate plan to room type
        if (rolosRoomTypeId) {
          await supabase.from("rolos_rate_plan_room_types").upsert({
            rate_plan_id: ratePlanId,
            room_type_id: rolosRoomTypeId,
          }, { onConflict: "rate_plan_id,room_type_id" });
        }
      }

      // ── 4. Hydrate availability into property_availability ──
      for (const row of rows) {
        const restrictions = row.restrictions || {};
        const stopSell = restrictions.stop_sell ?? false;
        const minStay = restrictions.min_stay ?? null;
        const maxStay = restrictions.max_stay ?? null;

        const { error: availErr } = await supabase.from("property_availability").upsert({
          property_id,
          room_type: name,
          date: row.date,
          available_units: row.available_units ?? 0,
          is_stop_sell: stopSell,
          minimum_stay: minStay,
          maximum_stay: maxStay,
          lead_days_advance: restrictions.lead_days_advance ?? null,
          lead_days_post: restrictions.lead_days_post ?? null,
          external_system: system_type,
        }, { onConflict: "property_id,room_type,date" });

        if (!availErr) availabilityUpserted++;
      }
    }

    const summary = {
      success: true,
      property_id,
      system_type,
      room_types_created: roomTypesCreated,
      rate_plans_created: ratePlansCreated,
      availability_upserted: availabilityUpserted,
    };
    console.log("[hydrate] Complete:", JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[hydrate] Fatal error:", error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
