import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
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
} from "lucide-react";
import type { RuReadinessReport } from "@/components/pms/channels/RuReadinessScorecard";

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
  has_name?: boolean;
  has_object_type_id?: boolean;
  can_sleep_max_ok?: boolean;
  has_description?: boolean;
  has_main_image?: boolean;
  has_street?: boolean;
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

  const saveBuildingId = async () => {
    setSavingBuildingId(true);
    const newId = buildingIdDraft.trim() || null;
    const { error: err } = await supabase
      .from("properties")
      .update({ rentalsunited_building_id: newId })
      .eq("id", propertyId);

    if (err) {
      toast.error("Failed to save building ID");
    } else {
      setBuildingId(newId);
      setEditingBuildingId(false);
      toast.success(newId ? "Building ID saved" : "Building ID cleared");
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
      toast.error("Failed to save RU ID");
    } else {
      setRuPropertyId(newId);
      setEditingRuId(false);
      toast.success("RU ID saved");
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
      toast.error("Failed to save unit RU ID");
    } else {
      setUnits((prev) =>
        prev.map((u) =>
          u.room_type_id === roomTypeId ? { ...u, ru_property_id: newId } : u
        )
      );
      setEditingUnitRuId(null);
      toast.success("Unit RU ID saved");
    }
    setSavingUnitRuId(false);
  };

  /**
   * A push returns the RUID in its response, but pushes fired outside this panel
   * (or a lost response) leave the local RU ID blank. This re-reads the RU property
   * list for the bound sub-user and captures the real RUIDs by name.
   */
  const resolveRuIds = async () => {
    setResolvingIds(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: "resolve_ru_property_ids", property_id: propertyId },
      });
      if (fnErr) throw new Error(await extractFunctionError(fnErr, "Could not read the Rentals United property list"));
      if (!data?.success) throw new Error(data?.error?.message ?? "Could not read the Rentals United property list");

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

      const unmatched: string[] = data.unmatched ?? [];
      if (matched.length === 0) {
        toast.warning(`No matching listings found on the Rentals United account (${data.remote_count ?? 0} listings scanned)`);
      } else {
        toast.success(
          `Captured ${matched.length} Rentals United ID${matched.length === 1 ? "" : "s"}${unmatched.length ? ` — ${unmatched.length} still unmatched` : ""}`,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to capture the Rentals United ID");
    } finally {
      setResolvingIds(false);
    }
  };

  const runDryRun = async () => {

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
      if (!data.success) { setError(data.error); return; }

      setIsMultiUnit(!!data.multi_unit);
      setValidation(data.validation);
      if (data.multi_unit && data.units) setUnits(data.units);
      if (data.building_id) setBuildingId(String(data.building_id));
      if (data.ru_property_id) setRuPropertyId(String(data.ru_property_id));
      setLastChecked(new Date().toLocaleTimeString());

      const v = data.validation;
      if (v.meets_minimum_images && v.meets_minimum_amenities && v.has_coordinates) {
        toast.success(data.multi_unit ? `All ${v.total_units} units ready to push` : "Property is ready to push to Rentals United");
      } else {
        toast.warning("Property needs attention before pushing to RU");
      }
    } catch (err) {
      setError({ code: "EXCEPTION", message: err instanceof Error ? err.message : "Unknown error" });
      toast.error("Failed to validate property");
    } finally {
      setDryRunning(false);
    }
  };

  const pushToRU = async () => {
    setLoading(true);
    setError(null);
    setDiagnostics(null);
    setUnitResults([]);
    setBuildingDiagnostics(null);

    try {
      const { data, error: fnErr } = await supabase.functions.invoke("push-property-to-ru", {
        body: { property_id: propertyId },
      });
      if (fnErr) throw new Error(fnErr.message);

      if (!data.success) {
        setError(data.error);
        if (data.diagnostics) setDiagnostics(data.diagnostics);
        toast.error(data.error?.message || "Push failed");
        return;
      }

      if (data.multi_unit) {
        setBuildingId(String(data.building_id));
        setUnitResults(data.units || []);
        setBuildingDiagnostics(data.building_diagnostics || null);
        // Refresh unit RU IDs from push results
        if (data.units) {
          setUnits((prev) =>
            prev.map((u) => {
              const pushed = data.units.find((r: any) => r.room_type_id === u.room_type_id);
              return pushed?.rentalsunited_property_id
                ? { ...u, ru_property_id: pushed.rentalsunited_property_id }
                : u;
            })
          );
        }
        const successCount = (data.units || []).filter((u: any) => u.success).length;
        toast.success(`Building + ${successCount}/${(data.units || []).length} units pushed to RU`);
      } else {
        setRuPropertyId(data.rentalsunited_property_id);
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
        validation.has_floor === false && "Floor number missing",
        validation.has_detailed_location_id === false && "DetailedLocationID not resolved",
        validation.has_description === false && "Description missing",
        validation.has_description !== false &&
          validation.description_meets_recommended === false &&
          `Description is short (${validation.description_length ?? 0} chars) — 100+ recommended (not an RU requirement)`,
        validation.has_payment_methods === false && "No payment method configured",
        validation.has_cancellation_policies === false && "No cancellation policy configured",
        validation.beds_cover_half === false &&
          `Beds (${validation.total_beds ?? 0}) cover less than 50% of max guests (${validation.max_guests ?? 0}) — RU minimum`,
        validation.beds_cover_half !== false &&
          validation.beds_meet_max_guests === false &&
          `Beds (${validation.total_beds ?? 0}) do not cover every guest (${validation.max_guests ?? 0}) — recommended, not required`,
        validation.amenities_padded === true &&
          `${validation.amenities_padded_count ?? 0} amenity(ies) auto-filled to reach RU's minimum of 10 — confirm or replace`,
      ].filter(Boolean) as string[])
    : [];

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Push to Rentals United</CardTitle>
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
            {isMultiUnit && (
              editingBuildingId ? (
                <div className="flex items-center gap-1">
                  <Input
                    value={buildingIdDraft}
                    onChange={(e) => setBuildingIdDraft(e.target.value)}
                    placeholder="Building ID"
                    className="h-6 w-28 text-xs px-1.5"
                  />
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={saveBuildingId} disabled={savingBuildingId}>
                    {savingBuildingId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => {
                      setEditingBuildingId(false);
                      setBuildingIdDraft(buildingId || "");
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Badge
                  variant={buildingId ? "secondary" : "outline"}
                  className="text-[10px] gap-1 cursor-pointer hover:bg-accent"
                  onClick={() => {
                    setBuildingIdDraft(buildingId || "");
                    setEditingBuildingId(true);
                  }}
                >
                  <Building2 className="h-3 w-3" />
                  {buildingId ? `Building: ${buildingId}` : "No Building ID — click to set"}
                </Badge>
              )
            )}
            {!isMultiUnit && (
              editingRuId ? (
                <div className="flex items-center gap-1">
                  <Input value={ruIdDraft} onChange={(e) => setRuIdDraft(e.target.value)} placeholder="RU Property ID" className="h-6 w-28 text-xs px-1.5" />
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={saveRuId} disabled={savingRuId}>
                    {savingRuId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditingRuId(false)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Badge variant="outline" className="text-xs cursor-pointer hover:bg-accent" onClick={() => { setRuIdDraft(ruPropertyId || ""); setEditingRuId(true); }}>
                  {ruPropertyId ? `RU ID: ${ruPropertyId}` : "No RU ID — click to set"}
                </Badge>
              )
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={runDryRun} disabled={dryRunning || loading}>
              {dryRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
              {dryRunning ? "Checking..." : "Validate"}
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={pushToRU}
              disabled={loading || dryRunning || readiness?.blocked === true || (validation !== null && !isReady)}
              title={readiness?.blocked ? "Complete the RU readiness checklist below before syncing" : undefined}
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              {loading ? "Pushing..." : readiness?.blocked ? "Sync blocked" : isMultiUnit ? "Push Building + Units" : "Push to RU"}
            </Button>
          </div>
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

          {wlGaps.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="text-xs font-medium">
                White-Label minimum inventory — {wlGaps.length} gap{wlGaps.length === 1 ? "" : "s"}
              </AlertTitle>
              <AlertDescription className="text-xs">
                <p className="mb-1 text-muted-foreground">
                  Rentals United can reject or hide White-Label inventory that is missing these fields.
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
                          <Input value={unitRuIdDraft} onChange={(e) => setUnitRuIdDraft(e.target.value)} placeholder="RU Property ID" className="h-6 w-28 text-xs px-1.5" />
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => saveUnitRuId(unit.room_type_id)} disabled={savingUnitRuId}>
                            {savingUnitRuId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditingUnitRuId(null)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-[10px] h-4 px-1 cursor-pointer hover:bg-accent" onClick={() => { setUnitRuIdDraft(unit.ru_property_id || ""); setEditingUnitRuId(unit.room_type_id); }}>
                          {unit.ru_property_id ? `RU: ${unit.ru_property_id}` : "No RU ID — click to set"}
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
                <span className="text-xs font-medium">Rentals United Sub-Account</span>
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
                  Open Rentals United Portal
                </a>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
