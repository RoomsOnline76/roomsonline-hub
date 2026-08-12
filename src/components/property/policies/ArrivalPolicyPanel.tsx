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
  const [unitDrafts, setUnitDrafts] = useState<Record<string, string>>({});
  const [savingUnit, setSavingUnit] = useState<string | null>(null);



  const load = useCallback(async () => {
    if (!propertyId) return;
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
      const amenities = (prop?.amenities ?? {}) as Record<string, any>;
      const current = String(amenities?.house_rules?.check_in_instructions ?? "");
      setText(current);
      setSaved(current);
      // The Rooms tab is the canonical unit list (properties.amenities.room_types).
      // Keep this list identical: only units that exist there are shown, using their
      // Rooms-tab name and casing. A blank value means "inherit the property policy".
      const canonical = Array.isArray(amenities?.room_types)
        ? (amenities.room_types as Array<{ name?: string | null }>)
        : [];
      const canonicalNames = new Map<string, string>();
      for (const rt of canonical) {
        const name = String(rt?.name ?? "").trim();
        if (name) canonicalNames.set(name.toLowerCase(), name);
      }
      const active = ((rooms ?? []) as Array<RoomOverride & { is_active?: boolean | null }>).filter(
        (r) => r.is_active === true,
      );
      const byName = new Map<string, RoomOverride>();
      for (const room of active) {
        const raw = String(room.name ?? "").trim();
        const key = raw.toLowerCase() || room.id;
        // Skip units the Rooms tab no longer lists.
        if (canonicalNames.size > 0 && !canonicalNames.has(key)) continue;
        const display = canonicalNames.get(key) ?? raw;
        const existing = byName.get(key);
        // Prefer the record that already carries unit-specific instructions.
        if (!existing || (!existing.check_in_instructions && room.check_in_instructions)) {
          byName.set(key, { ...room, name: display });
        }
      }
      setOverrides(
        Array.from(byName.values()).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
      );

      setUnitDrafts({});

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
        .in("id", overrides.filter((o) => String(o.check_in_instructions ?? "").trim().length > 0).map((o) => o.id));
      if (error) throw error;
      setOverrides((prev) => prev.map((o) => ({ ...o, check_in_instructions: null })));
      setUnitDrafts({});
      toast.success("Unit arrival instructions cleared — every unit now inherits the property policy");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not clear unit instructions");
    } finally {
      setClearing(false);
    }
  };

  /** Per-unit save. An empty value stores NULL, which makes the unit inherit the master policy. */
  const handleSaveUnit = async (unit: RoomOverride) => {
    const value = String(unitDrafts[unit.id] ?? "").trim();
    if (value.length > 0 && value.length < MIN_ARRIVAL_CHARS) {
      toast.error(`At least ${MIN_ARRIVAL_CHARS} characters are required — or clear the field to inherit the property policy`);
      return;
    }
    setSavingUnit(unit.id);
    try {
      const { error } = await supabase
        .from("hostfully_room_types")
        .update({ check_in_instructions: value.length ? value : null })
        .eq("id", unit.id);
      if (error) throw error;
      setOverrides((prev) =>
        prev.map((o) => (o.id === unit.id ? { ...o, check_in_instructions: value.length ? value : null } : o)),
      );
      setUnitDrafts((prev) => {
        const next = { ...prev };
        delete next[unit.id];
        return next;
      });
      toast.success(
        value.length
          ? `${unit.name ?? "Unit"} now uses its own arrival instructions`
          : `${unit.name ?? "Unit"} inherits the property arrival policy`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the unit arrival instructions");
    } finally {
      setSavingUnit(null);
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
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={drafting || saving}
            onClick={handleDraftWithTobi}
            title="TOBI drafts arrival instructions from this property's own details"
          >
            {drafting ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 mr-1" />
            )}
            {trimmed.length > 0 ? "Improve with TOBI" : "Write with TOBI"}
          </Button>

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
        <div className="rounded border border-border bg-muted/30 p-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-medium">
              Per-unit arrival instructions ({overrides.length})
            </p>
            <span className="text-[10px] text-muted-foreground">
              Leave a unit blank to inherit the property policy above — that is what channels and guest emails will send.
            </span>
            {overrides.some((o) => String(o.check_in_instructions ?? "").trim().length > 0) && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="ml-auto h-6 text-[10px]"
                disabled={clearing}
                onClick={handleClearOverrides}
              >
                {clearing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                Reset all units to the property policy
              </Button>
            )}
          </div>

          {overrides.map((unit) => {
            const stored = String(unit.check_in_instructions ?? "");
            const draft = unitDrafts[unit.id] ?? stored;
            const draftTrimmed = draft.trim();
            const unitDirty = draft !== stored;
            const unitTooShort = draftTrimmed.length > 0 && draftTrimmed.length < MIN_ARRIVAL_CHARS;
            const inherits = draftTrimmed.length === 0;
            const effectiveLength = inherits ? trimmed.length : draftTrimmed.length;

            return (
              <div key={unit.id} className="rounded border border-border/60 bg-background p-2 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-medium">{unit.name ?? "Unnamed unit"}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {inherits ? "Inherits property policy" : "Own instructions"}
                  </Badge>
                  {effectiveLength < MIN_ARRIVAL_CHARS ? (
                    <span className="flex items-center gap-1 text-[10px] text-destructive">
                      <AlertTriangle className="h-3 w-3" /> Effective instructions are {effectiveLength} characters —{" "}
                      {MIN_ARRIVAL_CHARS} required for channels
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" /> {effectiveLength} characters will be sent
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    {!inherits && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px]"
                        onClick={() => setUnitDrafts((prev) => ({ ...prev, [unit.id]: "" }))}
                      >
                        Use property policy
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px]"
                      disabled={!unitDirty || savingUnit === unit.id || unitTooShort}
                      onClick={() => void handleSaveUnit(unit)}
                    >
                      {savingUnit === unit.id ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Save className="h-3 w-3 mr-1" />
                      )}
                      Save
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={draft}
                  onChange={(e) => setUnitDrafts((prev) => ({ ...prev, [unit.id]: e.target.value }))}
                  rows={3}
                  placeholder="Blank = use the property arrival policy. Add unit-specific access here (gate code, key box, which chalet door)."
                  className={`text-xs ${unitTooShort ? "border-destructive focus-visible:ring-destructive" : ""}`}
                />
                {unitTooShort && (
                  <p className="text-[10px] text-destructive">
                    At least {MIN_ARRIVAL_CHARS} characters — or clear the field to inherit the property policy.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};
