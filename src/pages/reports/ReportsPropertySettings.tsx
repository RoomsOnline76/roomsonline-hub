import { reportsPath } from "@/lib/config";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Archive, ArrowLeft, Loader2, RefreshCw, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useReportsClients } from "@/hooks/useReportsClients";
import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  DEFAULT_REPORT_SOURCE,
  isReportSourceKey,
  listAdapters,
  type ReportSourceKey,
} from "@/lib/report-adapters";
import { usePageSEO } from "@/hooks/usePageSEO";
import { useReportProperties } from "@/hooks/useReportProperties";
import { usePropertyReportSettings } from "@/hooks/usePropertyReportSettings";
import {
  ROOM_COUNT_SOURCE_LABEL,
  useReportPropertyBrand,
} from "@/hooks/useReportPropertyBrand";
import { HistoricalBaselineEditor } from "@/components/reports/HistoricalBaselineEditor";
import { BrandAssetUpload } from "@/components/reports/BrandAssetUpload";
import {
  REPORT_BRAND_SOURCE_LABEL,
  resolveReportBrand,
  type ReportBrandSource,
} from "@/lib/reportBranding";
import type { HistoricalBaseline } from "@/lib/historicalBaseline";
import {
  ReportReadinessChecklist,
  type ReadinessItem,
} from "@/components/reports/ReportReadinessChecklist";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const HEX = /^#[0-9a-f]{6}$/i;

/** "TOURVEST, Staff" -> ["TOURVEST", "Staff"] */
const splitPatterns = (value: string): string[] =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

export default function ReportsPropertySettings() {
  const { propertyId } = useParams();
  const navigate = useNavigate();
  const { properties } = useReportProperties();
  const property = properties.find((p) => p.id === propertyId);
  const isReportsClient = Boolean(property?.isReportsClient);
  const { settings, isLoading, save } = usePropertyReportSettings(propertyId);
  const { brand: rolBrand } = useReportPropertyBrand(propertyId);
  const { updateClient, archiveClient } = useReportsClients();

  const [clientName, setClientName] = useState("");
  const [clientCity, setClientCity] = useState("");
  const [clientCountry, setClientCountry] = useState("");


  const [roomCount, setRoomCount] = useState("1");
  const [logoUrl, setLogoUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [primary, setPrimary] = useState("");
  const [secondary, setSecondary] = useState("");
  const [brandSource, setBrandSource] = useState<ReportBrandSource>("custom");
  const [logoInvert, setLogoInvert] = useState(false);
  const [baseline, setBaseline] = useState<HistoricalBaseline>({});
  const [roomCountTouched, setRoomCountTouched] = useState(false);
  const [sourceType, setSourceType] = useState<ReportSourceKey>(DEFAULT_REPORT_SOURCE);
  const [specialSet, setSpecialSet] = useState<string>("none");
  // Comma-separated while editing; stored as arrays.
  const [keepPatterns, setKeepPatterns] = useState("");
  const [excludePatterns, setExcludePatterns] = useState("");
  const [nbProfile, setNbProfile] = useState<NbProfile>(EMPTY_NB_PROFILE);

  usePageSEO({
    title: "Property report settings | Rooms Online",
    description: "Configure logo, capacity, brand colours and historical baselines.",
    noIndex: true,
  });

  useEffect(() => {
    if (!settings) return;
    setRoomCount(String(settings.roomCount ?? 1));
    setLogoUrl(settings.reportLogoUrl ?? "");
    setCoverUrl(settings.coverArtworkUrl ?? "");
    setPrimary(settings.brandPrimary ?? "");
    setSecondary(settings.brandSecondary ?? "");
    setBrandSource(
      settings.brandSource === "property" && isReportsClient
        ? "custom"
        : settings.brandSource ?? "custom",
    );

    setLogoInvert(Boolean(settings.logoInvert));
    setBaseline(settings.historicalBaseline ?? {});
    setSpecialSet(settings.specialReportSet ?? "none");
    setKeepPatterns((settings.zeroRevenueKeepPatterns ?? []).join(", "));
    setExcludePatterns((settings.rowExcludePatterns ?? []).join(", "));
    setNbProfile(settings.nbProfile ?? EMPTY_NB_PROFILE);

    setSourceType(
      isReportSourceKey(settings.defaultSourceType)
        ? settings.defaultSourceType
        : DEFAULT_REPORT_SOURCE,
    );
    setRoomCountTouched(true);
  }, [settings, isReportsClient]);

  // No saved settings yet → seed capacity from ROL inventory.
  useEffect(() => {
    if (isLoading || settings || roomCountTouched) return;
    if (rolBrand && rolBrand.roomCount > 0) {
      setRoomCount(String(rolBrand.roomCount));
      setRoomCountTouched(true);
    }
  }, [isLoading, settings, rolBrand, roomCountTouched]);



  // Reporting clients: load their editable identity fields.
  useEffect(() => {
    if (!isReportsClient || !propertyId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("properties")
        .select("name, city, country")
        .eq("id", propertyId)
        .maybeSingle();
      if (cancelled || !data) return;
      setClientName(data.name ?? "");
      setClientCity(data.city ?? "");
      setClientCountry(data.country ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [isReportsClient, propertyId]);

  const handleClientSave = async () => {
    if (!propertyId) return;
    try {
      await updateClient.mutateAsync({
        id: propertyId,
        name: clientName,
        city: clientCity,
        country: clientCountry,
      });
      toast.success("Client details saved");
    } catch (error) {
      toast.error("Could not save client details", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleArchiveClient = async () => {
    if (!propertyId) return;
    try {
      await archiveClient.mutateAsync({ id: propertyId, archived: true });
      toast.success("Reporting client archived");
      navigate(reportsPath("/"));
    } catch (error) {
      toast.error("Could not archive client", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };



  const resolved = useMemo(
    () =>
      resolveReportBrand(
        brandSource,
        rolBrand
          ? { logoUrl: rolBrand.logoUrl, primary: rolBrand.primary, secondary: rolBrand.secondary }
          : null,
        { logoUrl, primary, secondary },
      ),
    [brandSource, rolBrand, logoUrl, primary, secondary],
  );

  const readiness = useMemo<ReadinessItem[]>(() => {
    const rooms = Number(roomCount);
    const baselineMonths = Object.keys(baseline ?? {}).length;
    return [
      {
        label: "Sellable rooms captured",
        done: Number.isFinite(rooms) && rooms >= 1,
        hint: "Occupancy cannot be calculated without a room count.",
      },
      {
        label: "Report logo available",
        done: Boolean(resolved.logoUrl),
        hint: "Upload a logo, or switch branding to the Rooms Online default.",
      },
      {
        label: "Brand colours resolved",
        done: HEX.test(resolved.primary ?? "") && HEX.test(resolved.secondary ?? ""),
        hint: "Pick a branding source or enter two hex colours.",
      },
      {
        label: "Cover artwork set",
        done: Boolean(coverUrl),
        hint: "Optional — the cover page falls back to a plain brand panel.",
      },
      {
        label: "Last-year baseline loaded",
        done: baselineMonths > 0,
        hint: "Without a baseline the report shows no year-on-year comparison.",
      },
    ];
  }, [roomCount, resolved, coverUrl, baseline]);

  const handleSave = async () => {
    if (!propertyId) return;
    const rooms = Number(roomCount);
    if (!Number.isFinite(rooms) || rooms < 1) {
      toast.error("Room count must be 1 or more");
      return;
    }
    try {
      await save.mutateAsync({
        propertyId,
        roomCount: Math.floor(rooms),
        reportLogoUrl: brandSource === "custom" ? logoUrl || null : resolved.logoUrl,
        coverArtworkUrl: coverUrl || null,
        brandPrimary: resolved.primary,
        brandSecondary: resolved.secondary,
        brandSource,
        logoInvert,
        historicalBaseline: baseline,
        defaultSourceType: sourceType,
        specialReportSet: specialSet === "none" ? null : specialSet,
        zeroRevenueKeepPatterns: splitPatterns(keepPatterns),
        rowExcludePatterns: splitPatterns(excludePatterns),
        nbProfile,
      });
      toast.success("Report settings saved");
    } catch (error) {
      toast.error("Could not save settings", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link to={reportsPath("/")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Dashboard
        </Link>
      </Button>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {property ? `${property.name} — report settings` : "Property report settings"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Capacity drives occupancy; branding drives the workbook and the report pack.
        </p>
      </div>

      {properties.length > 1 && (
        <div className="max-w-sm space-y-2">
          <Label htmlFor="property-switch">Property</Label>
          <Select
            value={propertyId ?? ""}
            onValueChange={(next) => navigate(reportsPath(`/settings/${next}`))}
          >
            <SelectTrigger id="property-switch">
              <SelectValue placeholder="Choose a property" />
            </SelectTrigger>
            <SelectContent>
              {properties.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isReportsClient && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              Client details
              <Badge variant="outline" className="text-[11px] font-normal">
                Reporting only
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              This is a standalone reporting client. It exists for Revenue Reports only and
              never appears in the property list, on the website, or on the channel manager.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="client-edit-name">Client name</Label>
                <Input
                  id="client-edit-name"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-edit-city">City / area</Label>
                <Input
                  id="client-edit-city"
                  value={clientCity}
                  onChange={(e) => setClientCity(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-edit-country">Country</Label>
                <Input
                  id="client-edit-country"
                  value={clientCountry}
                  onChange={(e) => setClientCountry(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => void handleArchiveClient()}
                disabled={archiveClient.isPending}
              >
                {archiveClient.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Archive className="h-4 w-4 mr-2" />
                )}
                Archive client
              </Button>
              <Button onClick={() => void handleClientSave()} disabled={updateClient.isPending}>
                {updateClient.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save client details
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ReportReadinessChecklist items={readiness} />


      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Capacity &amp; branding</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Capacity */}
          <div className="space-y-2 max-w-sm">
            <Label htmlFor="room-count">Sellable rooms</Label>
            <div className="flex items-center gap-2">
              <Input
                id="room-count"
                type="number"
                min={1}
                value={roomCount}
                onChange={(e) => {
                  setRoomCountTouched(true);
                  setRoomCount(e.target.value);
                }}
              />
              {rolBrand && rolBrand.roomCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    setRoomCountTouched(true);
                    setRoomCount(String(rolBrand.roomCount));
                    toast.success(`Capacity set to ${rolBrand.roomCount} rooms from ROL`);
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-2" />
                  Use ROL ({rolBrand.roomCount})
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {Number(roomCount) >= 1
                ? `Capacity days = ${Math.floor(Number(roomCount))} rooms × 31 days = ${(
                    Math.floor(Number(roomCount)) * 31
                  ).toLocaleString("en-ZA")} room nights.`
                : "Capacity days = rooms × days in month (7 rooms × 31 = 217)."}
              {rolBrand && ` ROL inventory: ${ROOM_COUNT_SOURCE_LABEL[rolBrand.roomCountSource]}.`}
            </p>
            {Number(roomCount) > 400 && (
              <p className="text-xs font-medium text-destructive">
                That looks like capacity days, not rooms — occupancy would print at about{" "}
                {Math.round(100 / 31)}% of the true figure. Enter the sellable room count
                (roughly {Math.max(1, Math.round(Number(roomCount) / 30.4))}).
              </p>
            )}

          </div>

          {/* Default report source */}
          <div className="space-y-2 max-w-sm">
            <Label htmlFor="default-source">Default report source</Label>
            <Select
              value={sourceType}
              onValueChange={(next) => {
                if (isReportSourceKey(next)) setSourceType(next);
              }}
            >
              <SelectTrigger id="default-source">
                <SelectValue placeholder="Choose a source" />
              </SelectTrigger>
              <SelectContent>
                {listAdapters().map((option) => (
                  <SelectItem
                    key={option.key}
                    value={option.key}
                    disabled={option.status !== "ready"}
                  >
                    {option.label}
                    {option.status !== "ready" && " — coming soon"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Preselected when a new run is created for this property.
            </p>
          </div>

          {/* Specialised report set */}
          <div className="space-y-2 max-w-sm">
            <Label htmlFor="special-set">Specialised report set</Label>
            <Select value={specialSet} onValueChange={setSpecialSet}>
              <SelectTrigger id="special-set">
                <SelectValue placeholder="Standard pack only" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Standard pack only</SelectItem>
                <SelectItem value="cheetaplains">CheetaPlains owner pack</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Adds the bookings-by-nationality and top-travel-partner slides to every run for
              this property.
            </p>
          </div>

          {/* Brand source */}
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Branding source</Label>
              <p className="text-xs text-muted-foreground">
                {isReportsClient
                  ? "Standalone reporting clients have no ROL brand — set report-only logo and colours below, or follow the Rooms Online house brand."
                  : "Follow the property's own branding, fall back to the Rooms Online house brand, or set report-only colours."}
              </p>
            </div>
            <ToggleGroup
              type="single"
              value={brandSource}
              onValueChange={(v) => v && setBrandSource(v as ReportBrandSource)}
              className="justify-start flex-wrap"
            >
              {((isReportsClient
                ? ["rol", "custom"]
                : ["property", "rol", "custom"]) as ReportBrandSource[]).map((source) => (
                <ToggleGroupItem key={source} value={source} className="text-xs px-3">
                  {REPORT_BRAND_SOURCE_LABEL[source]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>


            {brandSource === "property" && !rolBrand?.primary && (
              <p className="text-xs text-muted-foreground">
                This property has no brand colours set in ROL — the Rooms Online defaults
                will be used.
              </p>
            )}

            {/* Resolved swatches */}
            <div className="flex items-center gap-4">
              {(
                [
                  ["Primary", resolved.primary],
                  ["Secondary", resolved.secondary],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex items-center gap-2">
                  <span
                    className="h-8 w-8 rounded border"
                    style={{ backgroundColor: value }}
                    aria-hidden
                  />
                  <span className="text-xs text-muted-foreground">
                    {label} {value}
                  </span>
                </div>
              ))}
              {resolved.logoUrl && (
                <img
                  src={resolved.logoUrl}
                  alt="Resolved report logo"
                  loading="lazy"
                  className="h-8 w-auto rounded border bg-muted object-contain p-1"
                  style={logoInvert ? { filter: "invert(1) hue-rotate(180deg)" } : undefined}
                />
              )}
            </div>

            <div className="mt-3 flex items-start justify-between gap-4 rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="logo-invert" className="text-sm">
                  Invert logo colours
                </Label>
                <p className="text-xs text-muted-foreground">
                  For white logos that disappear on the white report pages — flips them to black.
                </p>
              </div>
              <Switch id="logo-invert" checked={logoInvert} onCheckedChange={setLogoInvert} />
            </div>
          </div>

          {/* Custom overrides */}
          {brandSource === "custom" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <BrandAssetUpload
                label="Report logo"
                kind="logo"
                value={logoUrl}
                onChange={setLogoUrl}
                propertyId={propertyId}
                helpText="Any size — logos are exempt from the minimum dimensions."
              />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="brand-primary">Primary colour</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="brand-primary"
                      placeholder="#E91E8C"
                      value={primary}
                      onChange={(e) => setPrimary(e.target.value)}
                    />
                    <input
                      type="color"
                      aria-label="Pick primary colour"
                      value={HEX.test(primary) ? primary : "#e91e8c"}
                      onChange={(e) => setPrimary(e.target.value)}
                      className="h-9 w-10 shrink-0 cursor-pointer rounded border bg-background"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="brand-secondary">Secondary colour</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="brand-secondary"
                      placeholder="#1A1A2E"
                      value={secondary}
                      onChange={(e) => setSecondary(e.target.value)}
                    />
                    <input
                      type="color"
                      aria-label="Pick secondary colour"
                      value={HEX.test(secondary) ? secondary : "#1a1a2e"}
                      onChange={(e) => setSecondary(e.target.value)}
                      className="h-9 w-10 shrink-0 cursor-pointer rounded border bg-background"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Cover artwork applies to every branding mode */}
          <div className="max-w-md">
            <BrandAssetUpload
              label="Cover artwork"
              kind="cover"
              value={coverUrl}
              onChange={setCoverUrl}
              propertyId={propertyId}
              enforceMinDimensions
              previewClassName="h-28 w-full object-cover"
              helpText="Minimum 1024×768px — used on the report cover page."
            />
          </div>

          <div className="space-y-2">
            <Label>Historical baseline (last-year actuals)</Label>
            <p className="text-xs text-muted-foreground">
              Months that fall fully in the past are captured automatically when a run is
              processed; anything older can be imported here.
            </p>
            <HistoricalBaselineEditor
              baseline={baseline}
              roomCount={Math.max(Number(roomCount) || 1, 1)}
              onChange={setBaseline}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="keep-patterns">Keep these zero-revenue rows</Label>
              <Input
                id="keep-patterns"
                value={keepPatterns}
                onChange={(e) => setKeepPatterns(e.target.value)}
                placeholder="TOURVEST"
              />
              <p className="text-xs text-muted-foreground">
                Rows exported at 0.00 are treated as blocks, maintenance or owner stays and
                left out of room nights. Comma-separated labels listed here are kept as real
                nights — matched against guest, company, source and room.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="exclude-patterns">Always exclude these rows</Label>
              <Input
                id="exclude-patterns"
                value={excludePatterns}
                onChange={(e) => setExcludePatterns(e.target.value)}
                placeholder="Staff, Maintenance"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated labels that are never sold nights, whatever the revenue.
              </p>
            </div>
          </div>


          <div className="flex justify-end">
            <Button onClick={() => void handleSave()} disabled={save.isPending || isLoading}>
              {save.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
