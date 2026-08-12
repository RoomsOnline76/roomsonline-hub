import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Channel gate: Rentals United rejects arrival instructions under 20 characters. */
export const MIN_ARRIVAL_CHARS = 20;
/** ROL'OS editorial target — enough detail for a guest to actually find the door. */
export const TARGET_ARRIVAL_CHARS = 200;

export interface ArrivalPolicySummary {
  /** The master arrival policy text stored on properties.amenities.house_rules.check_in_instructions. */
  text: string;
  chars: number;
  /** Active units listed by the Rooms tab. */
  unitCount: number;
  /** Units that carry their own arrival instructions instead of inheriting the master policy. */
  overrideCount: number;
  loading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Read-only view of the property's master arrival policy, used by the Policy library row so
 * it renders exactly the values the Arrival policy editor works with. Storage is unchanged:
 * the master text lives on the property amenities, unit overrides on hostfully_room_types.
 */
export const useArrivalPolicy = (propertyId: string): ArrivalPolicySummary => {
  const [text, setText] = useState("");
  const [unitCount, setUnitCount] = useState(0);
  const [overrideCount, setOverrideCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!propertyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [{ data: prop }, { data: rooms }] = await Promise.all([
        supabase.from("properties").select("amenities").eq("id", propertyId).maybeSingle(),
        supabase
          .from("hostfully_room_types")
          .select("id, name, check_in_instructions, is_active")
          .eq("property_id", propertyId)
          .eq("is_active", true),
      ]);
      const amenities = (prop?.amenities ?? {}) as Record<string, unknown>;
      const houseRules = (amenities.house_rules ?? {}) as Record<string, unknown>;
      setText(String(houseRules.check_in_instructions ?? ""));

      // Mirror the editor: the Rooms tab (amenities.room_types) is the canonical unit list.
      const canonical = Array.isArray(amenities.room_types)
        ? (amenities.room_types as Array<{ name?: string | null }>)
        : [];
      const canonicalNames = new Set(
        canonical
          .map((rt) => String(rt?.name ?? "").trim().toLowerCase())
          .filter((name) => name.length > 0),
      );
      const active = ((rooms ?? []) as Array<{
        id: string;
        name?: string | null;
        check_in_instructions?: string | null;
      }>).filter((room) => {
        if (canonicalNames.size === 0) return true;
        return canonicalNames.has(String(room.name ?? "").trim().toLowerCase());
      });
      const byName = new Map<string, boolean>();
      for (const room of active) {
        const key = String(room.name ?? "").trim().toLowerCase() || room.id;
        const hasOwn = String(room.check_in_instructions ?? "").trim().length > 0;
        byName.set(key, (byName.get(key) ?? false) || hasOwn);
      }
      setUnitCount(byName.size);
      setOverrideCount(Array.from(byName.values()).filter(Boolean).length);
    } catch (e) {
      console.warn("[useArrivalPolicy] load failed:", e);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const trimmed = text.trim();
  return { text, chars: trimmed.length, unitCount, overrideCount, loading, refetch };
};
