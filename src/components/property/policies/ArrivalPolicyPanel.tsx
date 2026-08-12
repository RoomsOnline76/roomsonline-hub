import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Copy, Loader2, Save, Sparkles } from "lucide-react";
import type { SiblingProperty } from "@/hooks/usePortfolioSiblings";

/** Channel gate: Rentals United rejects arrival instructions under 20 characters. */
const MIN_ARRIVAL_CHARS = 20;
/** ROL'OS editorial target — enough detail for a guest to actually find the door. */
const TARGET_ARRIVAL_CHARS = 200;

interface RoomOverride {
  id: string;
  name: string | null;
  check_in_instructions: string | null;
}

interface ArrivalPolicyPanelProps {
  propertyId: string;
  siblings: SiblingProperty[];
}

/**
 * Single source of arrival policy for a property (and, on request, its whole portfolio).
 *
 * Stored on `properties.amenities.house_rules.check_in_instructions`, which is the value the
 * channel push (`arrival_how_to_arrive` / HowToArrive), guest confirmation emails and the
 * pro-forma invoice already fall back to. Room-level instructions override it, so overrides
 * are surfaced here and can be cleared to keep one source of truth.
 */
export const ArrivalPolicyPanel: React.FC<ArrivalPolicyPanelProps> = ({ propertyId, siblings }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState("");
  const [overrides, setOverrides] = useState<RoomOverride[]>([]);


  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const [{ data: prop }, { data: rooms }] = await Promise.all([
        supabase.from("properties").select("amenities").eq("id", propertyId).maybeSingle(),
        supabase
          .from("hostfully_room_types")
          .select("id, name, check_in_instructions")
          .eq("property_id", propertyId),
      ]);
      const amenities = (prop?.amenities ?? {}) as Record<string, any>;
      const current = String(amenities?.house_rules?.check_in_instructions ?? "");
      setText(current);
      setSaved(current);
      setOverrides(
        ((rooms ?? []) as RoomOverride[]).filter((r) => String(r.check_in_instructions ?? "").trim().length > 0),
      );
    } catch (e) {
      console.warn("[ArrivalPolicyPanel] load failed:", e);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const writeArrivalPolicy = useCallback(async (targetId: string, value: string) => {
    const { data, error } = await supabase
      .from("properties")
      .select("amenities")
      .eq("id", targetId)
      .maybeSingle();
    if (error) throw error;
    const amenities = (data?.amenities ?? {}) as Record<string, any>;
    const houseRules = (amenities.house_rules ?? {}) as Record<string, any>;
    const next = {
      ...amenities,
      house_rules: { ...houseRules, check_in_instructions: value },
    };
    const { error: upErr } = await supabase
      .from("properties")
      .update({ amenities: next })
      .eq("id", targetId);
    if (upErr) throw upErr;
  }, []);

  const trimmed = useMemo(() => text.trim(), [text]);
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_ARRIVAL_CHARS;
  const belowTarget = trimmed.length >= MIN_ARRIVAL_CHARS && trimmed.length < TARGET_ARRIVAL_CHARS;
  const dirty = text !== saved;

  const handleSave = async () => {
    setSaving(true);
    try {
      await writeArrivalPolicy(propertyId, trimmed);
      setSaved(trimmed);
      setText(trimmed);
      toast.success("Arrival policy saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the arrival policy");
    } finally {
      setSaving(false);
    }
  };

  /**
   * TOBI drafts the arrival instructions from the property's own facts. The prompt is
   * fact-bound — TOBI is never allowed to invent gate codes, key-safe numbers or road
   * names, so anything unknown is phrased as "sent with your confirmation".
   */
  const handleDraftWithTobi = async () => {
    setDrafting(true);
    try {
      const { data: prop, error } = await supabase
        .from("properties")
        .select("name, property_type, address, city, postal_code, country, amenities")
        .eq("id", propertyId)
        .maybeSingle();
      if (error) throw error;

      const amenities = (prop?.amenities ?? {}) as Record<string, any>;
      const houseRules = (amenities.house_rules ?? {}) as Record<string, any>;
      const surroundings = (amenities.surroundings ?? {}) as Record<string, any>;

      const { data, error: fnError } = await supabase.functions.invoke("editorial-ai-assist", {
        body: {
          action: "generate_arrival_policy",
          minChars: TARGET_ARRIVAL_CHARS,
          propertyContext: {
            name: prop?.name,
            property_type: prop?.property_type,
            street_address: prop?.address,
            suburb: amenities.suburb ?? null,
            city: prop?.city,
            postal_code: prop?.postal_code,
            country: prop?.country,
            check_in_time: houseRules.check_in_time ?? houseRules.check_in_from,
            check_out_time: houseRules.check_out_time ?? houseRules.check_out_until,
            parking: amenities.parking ?? houseRules.parking,
            closest_airport: surroundings.closest_airport ?? amenities.closest_airport,
            current: trimmed || null,
          },
        },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      const draft = String(data?.description ?? "").trim();
      if (!draft) throw new Error("TOBI returned an empty draft — please try again.");
      setText(draft);
      toast.success(`TOBI drafted ${draft.length} characters — review it, then save`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "TOBI could not write the arrival policy");
    } finally {
      setDrafting(false);
    }
  };


  const handleCopyToPortfolio = async () => {
    if (!siblings.length) return;
    setCopying(true);
    try {
      if (dirty) await writeArrivalPolicy(propertyId, trimmed);
      for (const sibling of siblings) await writeArrivalPolicy(sibling.id, trimmed);
      setSaved(trimmed);
      toast.success(
        `Arrival policy applied to ${siblings.length} portfolio propert${siblings.length === 1 ? "y" : "ies"}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not apply to the portfolio");
    } finally {
      setCopying(false);
    }
  };

  const handleClearOverrides = async () => {
    setClearing(true);
    try {
      const { error } = await supabase
        .from("hostfully_room_types")
        .update({ check_in_instructions: null })
        .in("id", overrides.map((o) => o.id));
      if (error) throw error;
      setOverrides([]);
      toast.success("Room-level arrival instructions cleared — the property policy is now the only source");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not clear room overrides");
    } finally {
      setClearing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading arrival policy…
      </div>
    );
  }

  return (
    <div className="space-y-2" data-field="arrival_policy">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder="How guests arrive: directions from the main road, gate or access codes, where to collect keys, who to call, and what happens on a late arrival."
        className={`text-xs ${tooShort ? "border-destructive focus-visible:ring-destructive" : ""}`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`text-[10px] font-mono ${
            tooShort ? "text-destructive" : belowTarget ? "text-amber-600" : "text-muted-foreground"
          }`}
        >
          {trimmed.length} / {TARGET_ARRIVAL_CHARS}
        </span>
        {trimmed.length === 0 && (
          <span className="flex items-center gap-1 text-[10px] text-destructive">
            <AlertTriangle className="h-3 w-3" /> No arrival policy — channels and guest emails will have nothing to show
          </span>
        )}
        {tooShort && (
          <span className="flex items-center gap-1 text-[10px] text-destructive">
            <AlertTriangle className="h-3 w-3" /> At least {MIN_ARRIVAL_CHARS} characters are required for channel distribution
          </span>
        )}
        {belowTarget && (
          <span className="flex items-center gap-1 text-[10px] text-amber-600">
            <AlertTriangle className="h-3 w-3" /> Passes the channel gate — add directions, keys and late-arrival detail to reach {TARGET_ARRIVAL_CHARS}
          </span>
        )}
        {trimmed.length >= TARGET_ARRIVAL_CHARS && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-600">
            <CheckCircle2 className="h-3 w-3" /> Ready for channels, confirmations and invoices
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {siblings.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={copying || saving || trimmed.length < MIN_ARRIVAL_CHARS}
              onClick={handleCopyToPortfolio}
            >
              {copying ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Copy className="h-3.5 w-3.5 mr-1" />
              )}
              Use for whole portfolio ({siblings.length})
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs"
            disabled={!dirty || saving}
            onClick={handleSave}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Save arrival policy
          </Button>
        </div>
      </div>

      {overrides.length > 0 && (
        <div className="rounded border border-amber-500/40 bg-amber-500/5 p-2 space-y-1.5">
          <p className="text-[10px] text-amber-700">
            {overrides.length} room{overrides.length === 1 ? "" : "s"} carry their own arrival instructions and will
            ignore this policy on channels and guest emails.
          </p>
          <div className="flex flex-wrap gap-1">
            {overrides.map((o) => (
              <Badge key={o.id} variant="outline" className="text-[10px]">
                {o.name ?? "Unnamed room"}
              </Badge>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 text-[10px]"
            disabled={clearing}
            onClick={handleClearOverrides}
          >
            {clearing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
            Clear room overrides and use this policy everywhere
          </Button>
        </div>
      )}
    </div>
  );
};
