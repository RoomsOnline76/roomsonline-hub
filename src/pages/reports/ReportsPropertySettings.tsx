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
  const [baselineJson, setBaselineJson] = useState("{}");

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
    setBaselineJson(JSON.stringify(settings.historicalBaseline ?? {}, null, 2));
  }, [settings]);

  const handleSave = async () => {
    if (!propertyId) return;
    let baseline: Record<string, unknown> = {};
    try {
      baseline = baselineJson.trim() ? JSON.parse(baselineJson) : {};
    } catch {
      toast.error("Historical baseline must be valid JSON");
      return;
    }
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
        historicalBaseline: baseline as never,
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
              <Label htmlFor="cover-url">Cover artwork URL</Label>
              <Input id="cover-url" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="brand-primary">Primary colour</Label>
                <Input
                  id="brand-primary"
                  placeholder="#E91E8C"
                  value={primary}
                  onChange={(e) => setPrimary(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brand-secondary">Secondary colour</Label>
                <Input
                  id="brand-secondary"
                  placeholder="#1A1A2E"
                  value={secondary}
                  onChange={(e) => setSecondary(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="baseline">Historical baseline (JSON)</Label>
            <textarea
              id="baseline"
              className="w-full min-h-40 rounded-md border bg-background px-3 py-2 text-sm font-mono"
              value={baselineJson}
              onChange={(e) => setBaselineJson(e.target.value)}
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              {`Shape: { "years": [2024, 2025], "revenue": { "2025-07": 343388.91 }, "room_nights": { "2025-07": 145 } }`}
            </p>
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
