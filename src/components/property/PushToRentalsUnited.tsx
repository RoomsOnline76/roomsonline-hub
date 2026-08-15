import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { pushPropertyToRu } from "@/lib/ruPushDriver";
import { toast } from "sonner";
import { extractFunctionError } from "@/lib/functionError";
import {
  Upload,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Image,
  MapPin,
  Home,
  BedDouble,
  Save,
  X,
  Building2,
  ExternalLink,
  User,
  RefreshCw,
} from "lucide-react";
import type { RuReadinessReport } from "@/components/pms/channels/RuReadinessScorecard";
import { usePropertyReadiness } from "@/hooks/usePropertyReadiness";
import ChannelContentSyncStatus from "@/components/property/ChannelContentSyncStatus";

import {
  RuChannelContentChecklist,
  type RuContentFlags,
} from "@/components/property/RuChannelContentChecklist";

interface PushToRentalsUnitedProps {
  propertyId: string;
  propertyName: string;
  /** RU readiness report from the shared scorecard — blocks push when not ready. */
  readiness?: RuReadinessReport | null;
}

interface RuOwnerAccount {
  ru_user_id: string | null;
  ru_owner_id: string | null;
  ru_login_email: string | null;
  ru_login_url: string | null;
  company_details_sent: boolean;
}

interface WlValidationFlags {
  has_zip_code?: boolean;
  has_space?: boolean;
  has_bathrooms?: boolean;
  has_toilets?: boolean;
  has_floor?: boolean;
  has_detailed_location_id?: boolean;
  has_payment_methods?: boolean;
  has_cancellation_policies?: boolean;
  beds_meet_max_guests?: boolean;
  beds_cover_half?: boolean;
  description_length?: number;
  description_meets_recommended?: boolean;
  amenities_padded?: boolean;
  amenities_padded_count?: number;
  total_beds?: number;
  total_bed_capacity?: number;
  has_name?: boolean;
  has_object_type_id?: boolean;
  can_sleep_max_ok?: boolean;
  has_description?: boolean;
  has_main_image?: boolean;
  has_street?: boolean;
  floor_is_default?: boolean;
  space_is_default?: boolean;
  payment_methods_is_default?: boolean;
  cancellation_policies_is_default?: boolean;
}

interface UnitValidation {
  room_type_id: string;
  name: string;
  ru_property_id: string | null;
  validation: {
    images_count: number;
    amenities_count: number;
    rooms_count: number;
    has_coordinates: boolean;
    meets_minimum_images: boolean;
    meets_minimum_amenities: boolean;
    max_guests?: number;
  } & WlValidationFlags;
}

interface ValidationResult extends WlValidationFlags {
  images_count: number;
  amenities_count: number;
  rooms_count: number;
  has_coordinates: boolean;
  meets_minimum_images: boolean;
  meets_minimum_amenities: boolean;
  max_guests?: number;
  total_units?: number;
  all_ready?: boolean;
}

interface PushError {
  code: string;
  message: string;
  ru_status_id?: string;
}

interface Diagnostics {
  error_stage?: string;
  xml_length?: number;
  xml_error_position?: number | null;
  xml_context?: string | null;
  request_preview?: string;
  request_xml?: string;
  response_preview?: string | null;
}

interface UnitPushResult {
  name: string;
  room_type_id: string;
  success: boolean;
  rentalsunited_property_id?: string;
  error?: string;
  availability_pushed?: boolean;
  prices_pushed?: boolean;
  diagnostics?: Diagnostics;
}

export function PushToRentalsUnited({ propertyId, readiness }: PushToRentalsUnitedProps) {
  const [loading, setLoading] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [units, setUnits] = useState<UnitValidation[]>([]);
  const [isMultiUnit, setIsMultiUnit] = useState(false);
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [ruPropertyId, setRuPropertyId] = useState<string | null>(null);
  const [editingBuildingId, setEditingBuildingId] = useState(false);
  const [buildingIdDraft, setBuildingIdDraft] = useState("");
  const [savingBuildingId, setSavingBuildingId] = useState(false);
  const [editingRuId, setEditingRuId] = useState(false);
  const [ruIdDraft, setRuIdDraft] = useState("");
  const [savingRuId, setSavingRuId] = useState(false);
  const [resolvingIds, setResolvingIds] = useState(false);
  const [editingUnitRuId, setEditingUnitRuId] = useState<string | null>(null);
  const [unitRuIdDraft, setUnitRuIdDraft] = useState("");
  const [savingUnitRuId, setSavingUnitRuId] = useState(false);
  const [error, setError] = useState<PushError | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [unitResults, setUnitResults] = useState<UnitPushResult[]>([]);
  const [buildingDiagnostics, setBuildingDiagnostics] = useState<Diagnostics | null>(null);

  const [ruOwnerAccount, setRuOwnerAccount] = useState<RuOwnerAccount | null>(null);
  const [autoManaged, setAutoManaged] = useState(false);
  const [ruOwnerLabel, setRuOwnerLabel] = useState<string | null>(null);
  /** Sub-account identity gate: no OwnerID or no API keys → every RU call is blocked. */
  const [identityGate, setIdentityGate] = useState<{ gated: boolean; reason: string | null }>({
    gated: false,
    reason: null,
  });

  /**
   * Registry-backed readiness — the same truth the wizard and the server gate use.
   * This is the primary client gate: unknown, still loading, or failed = blocked.
   */
  const gate = usePropertyReadiness(propertyId);
  const gateBlocked = !gate.hasData || gate.passed !== true;
  const gateReason = !gate.hasData
    ? gate.isLoading || gate.isFetching
      ? "Checking channel readiness…"
      : "Channel readiness could not be scored — reload before syncing"
    : gate.passed !== true
      ? `${gate.mandatoryOutstanding} mandatory requirement(s) outstanding — complete the checklist below before syncing`
      : null;


  useEffect(() => {
    // Load property RU IDs and owner email
    supabase
      .from("properties")
      .select("rentalsunited_property_id, rentalsunited_building_id, owner_email, ru_push_enabled, external_system, is_rol_property")
      .eq("id", propertyId)
      .single()
      .then(({ data }) => {
        setRuPropertyId(data?.rentalsunited_property_id ?? null);
        setBuildingId(data?.rentalsunited_building_id ?? null);
        // Auto-managed when the property runs on ROLOS PMS and RU push is enabled
        const isRolos = (data as any)?.external_system === 'rolos' || (data as any)?.is_rol_property === true;
        setAutoManaged(!!(isRolos && (data as any)?.ru_push_enabled !== false));

        // Load RU owner account if owner_email exists
        if (data?.owner_email) {
          supabase
            .from("ru_owner_accounts" as any)
            .select("ru_user_id, ru_owner_id, ru_login_email, ru_login_url, company_details_sent")
            .eq("owner_email", data.owner_email)
            .maybeSingle()
            .then(({ data: acct }) => {
              if (acct) setRuOwnerAccount(acct as unknown as RuOwnerAccount);
            });
        }
      });
  }, [propertyId]);

  useEffect(() => {
    let cancelled = false;
    supabase.functions
      .invoke("ru-cert-portal", { body: { action: "property_ru_identity", property_id: propertyId } })
      .then(({ data }) => {
        if (cancelled || !data?.success) return;
        setIdentityGate({ gated: data.push_gated === true, reason: data.gate_reason ?? null });
      })
      .catch(() => {/* panel on the Identity tab reports the real reason */});
    return () => {
      cancelled = true;
    };
  }, [propertyId]);


  /**
   * Buildings are legacy: units are pushed to RU as standalone properties and no push
   * touches building inventory any more. The only supported action is clearing a stale
   * link so nothing can reference a duplicate container.
   */
  const clearBuildingId = async () => {
    setSavingBuildingId(true);
    const { error: err } = await supabase
      .from("properties")
      .update({ rentalsunited_building_id: null })
      .eq("id", propertyId);

    if (err) {
      toast.error("Failed to clear building link");
    } else {
      setBuildingId(null);
      setEditingBuildingId(false);
      setBuildingIdDraft("");
      toast.success("Building link cleared — units push standalone");
    }

    setSavingBuildingId(false);
  };

  const saveRuId = async () => {
    setSavingRuId(true);
    const newId = ruIdDraft.trim() || null;
    const { error: err } = await supabase
      .from("properties")
      .update({ rentalsunited_property_id: newId })
      .eq("id", propertyId);
    if (err) {
      toast.error("Failed to save Channel Manager ID");
    } else {
      setRuPropertyId(newId);
      setEditingRuId(false);
      toast.success("Channel Manager ID saved");
    }
    setSavingRuId(false);
  };

  const saveUnitRuId = async (roomTypeId: string) => {
    setSavingUnitRuId(true);
    const newId = unitRuIdDraft.trim() || null;
    const { error: err } = await supabase
      .from("hostfully_room_types")
      .update({ rentalsunited_property_id: newId })
      .eq("id", roomTypeId);
    if (err) {
      toast.error("Failed to save unit Channel Manager ID");
    } else {
      setUnits((prev) =>
        prev.map((u) =>
          u.room_type_id === roomTypeId ? { ...u, ru_property_id: newId } : u
        )
      );
      setEditingUnitRuId(null);
      toast.success("Unit Channel Manager ID saved");
    }
    setSavingUnitRuId(false);
  };

  /**
   * A push returns the RUID in its response, but pushes fired outside this panel
   * (or a lost response) leave the local RU ID blank. This re-reads the RU property
   * list for the bound sub-user and captures the real RUIDs by name.
   */
  /** Re-read the stored RU links so the panel reflects what the fetch just wrote. */
  const reloadStoredRuIds = async () => {
    const [{ data: prop }, { data: rows }] = await Promise.all([
      supabase.from("properties").select("rentalsunited_property_id").eq("id", propertyId).maybeSingle(),
      supabase
        .from("hostfully_room_types")
        .select("id, name, rentalsunited_property_id, is_active")
        .eq("property_id", propertyId),
    ]);
    setRuPropertyId(prop?.rentalsunited_property_id ?? null);
    const active = (rows ?? []).filter((r) => r.is_active !== false);
    setUnits((prev) =>
      prev.map((u) => {
        const hit = active.find((r) => r.id === u.room_type_id);
        return hit ? { ...u, ru_property_id: hit.rentalsunited_property_id ?? null } : u;
      }),
    );
  };

  const resolveRuIds = async () => {
    setResolvingIds(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: "resolve_ru_property_ids", property_id: propertyId },
      });
      if (fnErr) throw new Error(await extractFunctionError(fnErr, "Could not read the Channel Manager property list"));
      if (!data?.success) throw new Error(data?.error?.message ?? "Could not read the Channel Manager property list");

      if (data.ru_owner_label) setRuOwnerLabel(String(data.ru_owner_label));
      else if (data.ru_owner_id) setRuOwnerLabel(`OwnerID ${data.ru_owner_id}`);

      const matched: { scope: string; name: string; ru_property_id: string }[] = data.matched ?? [];
      const propMatch = matched.find((m) => m.scope === "property");
      if (propMatch) setRuPropertyId(propMatch.ru_property_id);
      else if (data.rentalsunited_property_id) setRuPropertyId(String(data.rentalsunited_property_id));

      setUnits((prev) =>
        prev.map((u) => {
          const hit = matched.find((m) => m.scope === "unit" && m.name === u.name);
          return hit ? { ...u, ru_property_id: hit.ru_property_id } : u;
        }),
      );

      // The resolver writes the links server-side — re-read them so the badges match the DB.
      await reloadStoredRuIds();

      const unmatched: string[] = data.unmatched ?? [];
      const acct = data.ru_owner_label ?? (data.ru_owner_id ? `OwnerID ${data.ru_owner_id}` : "sub-account");
      if (matched.length === 0) {
        toast.warning(`No matching listings on ${acct} (${data.remote_count ?? 0} listing(s) scanned)`);
      } else {
        toast.success(
          `Linked ${matched.length} Channel Manager ID${matched.length === 1 ? "" : "s"} from ${acct}${unmatched.length ? ` — ${unmatched.length} still unmatched` : ""}`,
        );
      }

    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to capture the Channel Manager ID");
    } finally {
      setResolvingIds(false);
    }
  };

  /**
   * Server dry run. Returns the outcome so the live push can require a clean run
   * from the same session instead of treating validation as optional.
   */
  const runDryRun = async (opts: { silent?: boolean } = {}): Promise<{ ok: boolean; gaps: string[]; message?: string }> => {

    setDryRunning(true);
    setError(null);
    setDiagnostics(null);
    setValidation(null);
    setUnits([]);
    setUnitResults([]);
    setBuildingDiagnostics(null);

    try {
      const { data, error: fnErr } = await supabase.functions.invoke("push-property-to-ru", {
        body: { property_id: propertyId, dry_run: true },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (!data.success) {
        setError(data.error);
        return { ok: false, gaps: (data.gaps ?? []) as string[], message: data.error?.message };
      }

      setIsMultiUnit(!!data.multi_unit);
      setValidation(data.validation);
      if (data.multi_unit && data.units) setUnits(data.units);
      if (data.building_id) setBuildingId(String(data.building_id));
      if (data.ru_property_id) setRuPropertyId(String(data.ru_property_id));
      setLastChecked(new Date().toLocaleTimeString());

      const v = data.validation;
      const gaps = (data.gaps ?? []) as string[];
      const ok =
        gaps.length === 0
        && !!v?.meets_minimum_images
        && !!v?.meets_minimum_amenities
        && !!v?.has_coordinates;
      if (!opts.silent) {
        if (ok) {
          toast.success(data.multi_unit ? `All ${v.total_units} units ready to push` : "Property is ready to publish to the Channel Manager");
        } else {
          toast.warning("Property needs attention before publishing to the Channel Manager");
        }
      }
      return { ok, gaps };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError({ code: "EXCEPTION", message });
      if (!opts.silent) toast.error("Failed to validate property");
      return { ok: false, gaps: [], message };
    } finally {
      setDryRunning(false);
    }
  };

  const pushToRU = async () => {
    // Fail closed on the registry gate — never rely on the button's disabled state alone.
    if (gateBlocked) {
      toast.error(gateReason ?? "Channel readiness is not satisfied");
      return;
    }

    setLoading(true);
    setError(null);
    setDiagnostics(null);
    setUnitResults([]);
    setBuildingDiagnostics(null);

    try {
      // Mandatory server dry run: the live push only starts after a clean run this session.
      const check = await runDryRun({ silent: true });
      if (!check.ok) {
        const detail = check.gaps.length
          ? `${check.gaps.length} requirement(s) outstanding — ${check.gaps.slice(0, 3).join(" · ")}`
          : check.message ?? "Validation failed";
        toast.error(`Push blocked by the pre-flight check: ${detail}`, { duration: 12000 });
        return;
      }


      // Resumable batches keep long multi-unit pushes inside the worker budget.
      const data = await pushPropertyToRu(propertyId, {
        onProgress: ({ units }) => setUnitResults(units as any[]),
      });

      if (data.multi_unit && data.units) {
        setUnitResults(data.units as any[]);
        setUnits((prev) =>
          prev.map((u) => {
            const pushed = (data.units ?? []).find((r) => r.room_type_id === u.room_type_id);
            return pushed?.rentalsunited_property_id
              ? { ...u, ru_property_id: pushed.rentalsunited_property_id }
              : u;
          })
        );
      }

      if (!data.success) {
        setError(data.error as any);
        if (data.diagnostics) setDiagnostics(data.diagnostics as any);
        const unitFailures = (data.units ?? [])
          .filter((u) => u.success === false)
          .map((u) => `${u.name ?? "Unit"} — ${u.error ?? "failed"}`);
        toast.error(
          unitFailures.length
            ? `${data.error?.message || "Push failed"} — ${unitFailures.slice(0, 3).join(" · ")}`
            : data.error?.message || "Push failed",
          { duration: 12000 },
        );
        return;
      }

      if (data.multi_unit) {
        if (data.building_id) setBuildingId(String(data.building_id));
        setBuildingDiagnostics((data.building_diagnostics as any) || null);
        const successCount = (data.units || []).filter((u) => u.success).length;
        toast.success(`${successCount}/${(data.units || []).length} units published to the Channel Manager`);
      } else {
        setRuPropertyId(data.rentalsunited_property_id as string);
        toast.success(`Property pushed to Rentals United (ID: ${data.rentalsunited_property_id})`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError({ code: "EXCEPTION", message });
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const isReady = validation && validation.meets_minimum_images && validation.meets_minimum_amenities && validation.has_coordinates && validation.rooms_count > 0;

  const issues = validation ? [
    !validation.meets_minimum_images && { icon: Image, tab: "images", label: `Need at least 10 images (currently ${validation.images_count})` },
    !validation.meets_minimum_amenities && { icon: Home, tab: "info-facilities", label: `Need at least 10 amenities (currently ${validation.amenities_count})` },
    !validation.has_coordinates && { icon: MapPin, tab: "general", label: "Property must have latitude and longitude coordinates" },
    validation.rooms_count === 0 && { icon: BedDouble, tab: "rooms", label: "Property must have at least 1 room type" },
  ].filter(Boolean) as { icon: any; tab: string; label: string }[] : [];

  // Rentals United White-Label minimum inventory gaps (warn, don't block)
  const wlGaps = validation
    ? ([
        validation.has_name === false && "Property/unit name missing",
        validation.has_object_type_id === false && "ObjectTypeID (property type) not set",
        validation.can_sleep_max_ok === false && "CanSleepMax must be at least 1",
        validation.has_main_image === false && "No main photo flagged on the image set",
        validation.has_street === false && "Street address missing",
        validation.has_zip_code === false && "ZIP / postal code missing",
        validation.has_space === false && "Property size (Space, m²) missing",
        validation.has_bathrooms === false && "Number of bathrooms missing (mandatory)",
        validation.has_toilets === false && "Number of toilets missing (mandatory)",
        validation.has_floor === false && "Floor number missing",
        validation.has_detailed_location_id === false && "DetailedLocationID not resolved",
        validation.has_description === false && "Description missing",
        validation.has_description !== false &&
          validation.description_meets_recommended === false &&
          `Description is short (${validation.description_length ?? 0} chars) — 100+ recommended (not a Channel Manager requirement)`,
        validation.has_payment_methods === false && "No payment method configured",
        validation.has_cancellation_policies === false && "No cancellation policy configured",
        validation.beds_cover_half === false &&
          `Beds sleep ${validation.total_bed_capacity ?? validation.total_beds ?? 0} of ${validation.max_guests ?? 0} max guests — Channel Manager minimum is 50%`,
        validation.beds_cover_half !== false &&
          validation.beds_meet_max_guests === false &&
          `Beds sleep ${validation.total_bed_capacity ?? validation.total_beds ?? 0} people but the unit takes ${validation.max_guests ?? 0} guests — recommended, not required`,
        validation.amenities_padded === true &&
          `${validation.amenities_padded_count ?? 0} amenity(ies) auto-filled to reach the Channel Manager's minimum of 10 — confirm or replace`,
        validation.payment_methods_is_default === true &&
          "Payment methods fell back to Cash + credit card — confirm in Policies → Accepted payment methods",
        validation.cancellation_policies_is_default === true &&
          "Cancellation policy fell back to the standard default — confirm in Policies",
        validation.floor_is_default === true &&
          "Floor fell back to 0 (ground) — set it in Info & Facilities → Property Info",
        validation.space_is_default === true &&
          "Property size fell back to 50 m² — set it in Info & Facilities → Property Info",
      ].filter(Boolean) as string[])
    : [];

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Publish to Channel Manager</CardTitle>
            {autoManaged && (
              <Badge variant="secondary" className="text-[10px] h-5 gap-1">
                <CheckCircle className="h-3 w-3" />
                Auto-managed (ROLOS PMS)
              </Badge>
            )}
            {readiness && (
              <Badge
                variant={readiness.blocked ? "destructive" : "secondary"}
                className="text-[10px] h-5 gap-1"
              >
                {readiness.blocked ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle className="h-3 w-3" />}
                Readiness {readiness.score}%{readiness.blocked ? " — sync blocked" : " — ready"}
              </Badge>
            )}
            {isMultiUnit && buildingId && (
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Building2 className="h-3 w-3" />
                  Legacy building: {buildingId}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-[10px]"
                  onClick={clearBuildingId}
                  disabled={savingBuildingId}
                  title="Units are pushed as standalone Channel Manager properties — clear the stale building link"
                >
                  {savingBuildingId ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                  <span className="ml-1">Clear</span>
                </Button>
              </div>
            )}
            {!isMultiUnit && (
              editingRuId ? (
                <div className="flex items-center gap-1">
                  <Input value={ruIdDraft} onChange={(e) => setRuIdDraft(e.target.value)} placeholder="Channel Manager Property ID" className="h-6 w-28 text-xs px-1.5" />
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={saveRuId} disabled={savingRuId}>
                    {savingRuId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditingRuId(false)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Badge variant="outline" className="text-xs cursor-pointer hover:bg-accent" onClick={() => { setRuIdDraft(ruPropertyId || ""); setEditingRuId(true); }}>
                  {ruPropertyId ? `Channel Manager ID: ${ruPropertyId}` : "No Channel Manager ID — click to set"}
                </Badge>
              )
            )}
          </div>
          <div className="flex items-center gap-2">
            {(ruOwnerLabel || ruOwnerAccount?.ru_owner_id) && (
              <Badge variant="outline" className="text-[10px] h-5 gap-1" title="Distribution account the IDs are fetched from">
                <User className="h-3 w-3" />
                {ruOwnerLabel ?? `OwnerID ${ruOwnerAccount?.ru_owner_id}`}
              </Badge>
            )}
            {identityGate.gated && (
              <Badge variant="outline" className="text-[10px] h-5 gap-1 border-amber-500/60 text-amber-600">
                <AlertTriangle className="h-3 w-3" />
                Sub-account keys required
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={resolveRuIds}
              disabled={resolvingIds || loading || dryRunning || identityGate.gated}
              title={
                identityGate.gated
                  ? identityGate.reason ?? "Link the distribution account and capture its API keys on the Identity tab first"
                  : "Read the Channel Manager listing IDs for this property's distribution account and store them here"
              }
            >
              {resolvingIds ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {resolvingIds ? "Fetching..." : "Fetch Channel Manager IDs"}
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => void runDryRun()} disabled={dryRunning || loading}>
              {dryRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
              {dryRunning ? "Checking..." : "Validate"}
            </Button>
            {published ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="h-6 gap-1 text-[10px]">
                  <CheckCircle className="h-3 w-3" />
                  Published — Channel Manager enabled
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => navigate(`/pms/channels?property=${propertyId}`)}
                >
                  <ExternalLink className="h-3 w-3" />
                  Connect channels
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={pushToRU}
                disabled={
                  loading ||
                  dryRunning ||
                  identityGate.gated ||
                  gateBlocked ||
                  readiness?.blocked === true ||
                  (validation !== null && !isReady)
                }
                title={
                  identityGate.gated
                    ? identityGate.reason ?? "Link the distribution account and capture its API keys on the Identity tab first"
                    : gateBlocked
                      ? gateReason ?? "Complete the channel readiness checklist below before syncing"
                      : readiness?.blocked
                        ? "Complete the channel readiness checklist below before syncing"
                        : undefined
                }
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                {loading
                  ? "Pushing..."
                  : identityGate.gated
                    ? "Keys required"
                    : !gate.hasData && (gate.isLoading || gate.isFetching)
                      ? "Checking readiness…"
                      : gateBlocked || readiness?.blocked
                        ? "Sync blocked"
                        : isMultiUnit
                          ? "Push Building + Units"
                          : "Publish to Channel Manager"}
              </Button>
            )}



          </div>
        </div>
        <div className="mt-2 border-t pt-2">
          <ChannelContentSyncStatus propertyId={propertyId} />
        </div>
      </CardHeader>

      {(validation || error || unitResults.length > 0) && (
        <CardContent className="pt-0 pb-3 px-4 space-y-2">
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="text-xs font-medium">
                {error.code}{error.ru_status_id ? ` (RU Status: ${error.ru_status_id})` : ""}
              </AlertTitle>
              <AlertDescription className="text-xs space-y-1">
                <p>{error.message}</p>
                {diagnostics?.xml_error_position != null && (
                  <p className="text-[10px] text-muted-foreground">XML error at position {diagnostics.xml_error_position} of {diagnostics.xml_length}</p>
                )}
                {diagnostics?.xml_context && (
                  <pre className="text-[10px] bg-muted rounded p-1 overflow-x-auto whitespace-pre-wrap break-all max-h-20">{diagnostics.xml_context}</pre>
                )}
              </AlertDescription>
            </Alert>
          )}

          {validation && isReady && (
            <Alert className="border-border bg-muted/30">
              <CheckCircle className="h-4 w-4 text-foreground" />
              <AlertTitle className="text-xs font-medium text-foreground">
                {isMultiUnit ? `Building ready — ${validation.total_units} units` : "Ready to push"}
              </AlertTitle>
              <AlertDescription className="text-xs text-foreground">
                {isMultiUnit
                  ? `${validation.total_units} units · All have ≥10 images & amenities · Coordinates set`
                  : `${validation.images_count} images · ${validation.amenities_count} amenities · ${validation.rooms_count} rooms · Coordinates set`}
              </AlertDescription>
            </Alert>
          )}

          <RuChannelContentChecklist
            propertyId={propertyId}
            validation={(validation as RuContentFlags | null) ?? null}
          />

          {wlGaps.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="text-xs font-medium">
                White-Label minimum inventory — {wlGaps.length} gap{wlGaps.length === 1 ? "" : "s"}
              </AlertTitle>
              <AlertDescription className="text-xs">
                <p className="mb-1 text-muted-foreground">
                  The Channel Manager can reject or hide White-Label inventory that is missing these fields.
                </p>
                <ul className="list-disc list-inside space-y-0.5">
                  {wlGaps.map((g, i) => <li key={i}>{g}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {buildingDiagnostics?.request_preview && (
            <Alert>
              <Building2 className="h-4 w-4" />
              <AlertTitle className="text-xs font-medium">Building XML</AlertTitle>
              <AlertDescription className="space-y-1 text-xs">
                <pre className="text-[10px] bg-muted rounded p-1 overflow-x-auto whitespace-pre-wrap break-all max-h-24">{buildingDiagnostics.request_preview}</pre>
                {buildingDiagnostics.response_preview && (
                  <pre className="text-[10px] bg-muted rounded p-1 overflow-x-auto whitespace-pre-wrap break-all max-h-24">{buildingDiagnostics.response_preview}</pre>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Multi-unit: per-unit validation details */}
          {isMultiUnit && units.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Units</p>
              {units.map((unit) => {
                const v = unit.validation;
                const ready = v.meets_minimum_images && v.meets_minimum_amenities && v.has_coordinates;
                return (
                  <div key={unit.room_type_id} className="flex items-center justify-between text-xs border rounded px-2 py-1">
                    <div className="flex items-center gap-2">
                      {ready ? <CheckCircle className="h-3 w-3 text-foreground" /> : <AlertTriangle className="h-3 w-3 text-muted-foreground" />}
                      <span className="font-medium">{unit.name}</span>
                      {editingUnitRuId === unit.room_type_id ? (
                        <div className="flex items-center gap-1">
                          <Input value={unitRuIdDraft} onChange={(e) => setUnitRuIdDraft(e.target.value)} placeholder="Channel Manager Property ID" className="h-6 w-28 text-xs px-1.5" />
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => saveUnitRuId(unit.room_type_id)} disabled={savingUnitRuId}>
                            {savingUnitRuId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditingUnitRuId(null)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-[10px] h-4 px-1 cursor-pointer hover:bg-accent" onClick={() => { setUnitRuIdDraft(unit.ru_property_id || ""); setEditingUnitRuId(unit.room_type_id); }}>
                          {unit.ru_property_id ? `Channel Manager: ${unit.ru_property_id}` : "No Channel Manager ID — click to set"}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{v.images_count} img</span>
                      <span>{v.amenities_count} amen</span>
                      <span>{v.max_guests || "?"} guests</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Multi-unit: push results */}
          {unitResults.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Push Results</p>
              {unitResults.map((ur) => (
                <div key={ur.room_type_id} className={`flex items-center justify-between text-xs border rounded px-2 py-1 ${ur.success ? "border-border" : "border-destructive/30"}`}>
                  <div className="flex items-center gap-2">
                    {ur.success ? <CheckCircle className="h-3 w-3 text-foreground" /> : <X className="h-3 w-3 text-destructive" />}
                    <span className="font-medium">{ur.name}</span>
                    {ur.rentalsunited_property_id && <Badge variant="outline" className="text-[10px] h-4 px-1">RU: {ur.rentalsunited_property_id}</Badge>}
                  </div>
                  <div className="flex items-center gap-1 text-[10px]">
                    {ur.success ? (
                      <>
                        {ur.availability_pushed && <Badge variant="secondary" className="text-[9px] h-4 px-1">Avail ✓</Badge>}
                        {ur.prices_pushed && <Badge variant="secondary" className="text-[9px] h-4 px-1">Prices ✓</Badge>}
                      </>
                    ) : (
                      <span className="text-destructive truncate max-w-[200px]">{ur.error}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {unitResults.some((ur) => ur.diagnostics?.request_preview) && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Unit XML Previews</p>
              {unitResults.filter((ur) => ur.diagnostics?.request_preview).map((ur) => (
                <div key={`${ur.room_type_id}-xml`} className="border rounded px-2 py-1 space-y-1">
                  <p className="text-xs font-medium">{ur.name}</p>
                  <pre className="text-[10px] bg-muted rounded p-1 overflow-x-auto whitespace-pre-wrap break-all max-h-24">{ur.diagnostics?.request_preview}</pre>
                  {ur.diagnostics?.response_preview && (
                    <pre className="text-[10px] bg-muted rounded p-1 overflow-x-auto whitespace-pre-wrap break-all max-h-24">{ur.diagnostics.response_preview}</pre>
                  )}
                </div>
              ))}
            </div>
          )}

          {validation && !isReady && issues.length > 0 && (
            <Alert variant="destructive" className="border-border bg-muted/30">
              <AlertTriangle className="h-4 w-4 text-foreground" />
              <AlertTitle className="text-xs font-medium text-foreground">Missing requirements:</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 space-y-1">
                  {issues.map((issue, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-foreground">
                      <issue.icon className="h-3 w-3 flex-shrink-0" />
                      <span>{issue.label}</span>
                      <Badge variant="outline" className="text-[10px] h-4 px-1">{issue.tab} tab</Badge>
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {lastChecked && (
            <p className="text-[10px] text-muted-foreground text-right">Last checked: {lastChecked}</p>
          )}

          {/* RU Sub-Account Details */}
          {ruOwnerAccount && (
            <div className="border rounded px-3 py-2 space-y-1 bg-muted/20">
              <div className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium">Distribution account</span>
                {ruOwnerAccount.ru_owner_id && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1">Owner: {ruOwnerAccount.ru_owner_id}</Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                {ruOwnerAccount.ru_login_email && (
                  <div>
                    <span className="text-muted-foreground">Login Email:</span>{" "}
                    <span className="font-mono">{ruOwnerAccount.ru_login_email}</span>
                  </div>
                )}
                {ruOwnerAccount.ru_user_id && (
                  <div>
                    <span className="text-muted-foreground">Account ID:</span>{" "}
                    <span className="font-mono">{ruOwnerAccount.ru_user_id}</span>
                  </div>
                )}
              </div>
              {ruOwnerAccount.ru_login_url && (
                <a
                  href={ruOwnerAccount.ru_login_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open Channel Manager Portal
                </a>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
