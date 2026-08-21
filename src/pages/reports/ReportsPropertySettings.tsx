import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { usePageSEO } from "@/hooks/usePageSEO";
import { useReportProperties } from "@/hooks/useReportProperties";
import { usePropertyReportSettings } from "@/hooks/usePropertyReportSettings";
import { HistoricalBaselineEditor } from "@/components/reports/HistoricalBaselineEditor";
import type { HistoricalBaseline } from "@/lib/historicalBaseline";

export default function ReportsPropertySettings() {
  const { propertyId } = useParams();
  const { properties } = useReportProperties();
  const property = properties.find((p) => p.id === propertyId);
  const { settings, isLoading, save } = usePropertyReportSettings(propertyId);

  const [roomCount, setRoomCount] = useState("1");
  const [logoUrl, setLogoUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [primary, setPrimary] = useState("");
  const [secondary, setSecondary] = useState("");
  const [baseline, setBaseline] = useState<HistoricalBaseline>({});

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
    setBaseline(settings.historicalBaseline ?? {});
  }, [settings]);

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
        reportLogoUrl: logoUrl || null,
        coverArtworkUrl: coverUrl || null,
        brandPrimary: primary || null,
        brandSecondary: secondary || null,
        historicalBaseline: baseline,
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
        <Link to="/">
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Capacity &amp; branding</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="room-count">Sellable rooms</Label>
              <Input
                id="room-count"
                type="number"
                min={1}
                value={roomCount}
                onChange={(e) => setRoomCount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Capacity days = rooms × days in month (7 rooms × 31 = 217).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="logo-url">Report logo URL</Label>
              <Input id="logo-url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="logo-url">Report logo URL</Label>
              <Input id="logo-url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt="Report logo preview"
                  loading="lazy"
                  className="h-10 w-auto rounded border bg-muted object-contain p-1"
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cover-url">Cover artwork URL</Label>
              <Input id="cover-url" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} />
              {coverUrl && (
                <img
                  src={coverUrl}
                  alt="Cover artwork preview"
                  loading="lazy"
                  className="h-24 w-full rounded border object-cover"
                />
              )}
            </div>
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
                    value={/^#[0-9a-f]{6}$/i.test(primary) ? primary : "#e91e8c"}
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
                    value={/^#[0-9a-f]{6}$/i.test(secondary) ? secondary : "#1a1a2e"}
                    onChange={(e) => setSecondary(e.target.value)}
                    className="h-9 w-10 shrink-0 cursor-pointer rounded border bg-background"
                  />
                </div>
              </div>
            </div>

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
