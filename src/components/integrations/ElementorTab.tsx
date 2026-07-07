import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { CheckCircle2, Blocks, LayoutGrid, Calendar, ImageIcon, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { CodeSnippetBlock } from "@/components/integrations/CodeSnippetBlock";
import { WidgetPreviewFrame } from "@/components/integrations/WidgetPreviewFrame";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PUBLIC_DOMAIN } from "@/lib/config";
import { useWhitelabel } from "@/hooks/useWhitelabel";

interface ElementorTabProps {
  property: {
    id: string;
    name: string;
    slug: string;
    brand_primary_color: string | null;
  };
}

export function ElementorTab({ property }: ElementorTabProps) {
  const defaultColor = property.brand_primary_color || "#e91e63";

  // Booking Widget config
  const [bwColor, setBwColor] = useState(defaultColor);
  const [bwLayout, setBwLayout] = useState("standard");
  const [bwHeight, setBwHeight] = useState(600);

  // Property Card config
  const [pcShowPrice, setPcShowPrice] = useState(true);
  const [pcShowAvail, setPcShowAvail] = useState(true);
  const [pcStyle, setPcStyle] = useState("detailed");

  // Availability Grid config
  const [agMonths, setAgMonths] = useState(2);
  const [agColor, setAgColor] = useState(defaultColor);

  const [expanded, setExpanded] = useState<string | null>("booking");

  const bwShortcode = `[rolos_booking_widget property_id="${property.id}" color="${bwColor}" layout="${bwLayout}" height="${bwHeight}"]`;
  const pcShortcode = `[rolos_property_card property_id="${property.id}" show_price="${pcShowPrice}" show_availability="${pcShowAvail}" style="${pcStyle}"]`;
  const agShortcode = `[rolos_availability property_id="${property.id}" months="${agMonths}" color="${agColor}"]`;

  const embedUrl = `${PUBLIC_DOMAIN}/embed/property/${property.slug}?integration=elementor&property_id=${property.id}&brand_color=${encodeURIComponent(bwColor)}&mode=embedded`;

  const toggle = (key: string) => setExpanded(expanded === key ? null : key);

  return (
    <div className="space-y-6">
      {/* Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Blocks className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Elementor Widgets</CardTitle>
              <CardDescription>
                Drag-and-drop ROL'OS widgets inside the Elementor editor. Configure below, then copy the shortcode or use the native Elementor controls.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/50 rounded-lg p-4 space-y-3 text-sm">
            <h4 className="font-semibold">Setup Instructions</h4>
            <ol className="space-y-2 list-decimal list-inside text-muted-foreground">
              <li>Install and activate the <strong>ROL'OS Plugin</strong> on your WordPress site</li>
              <li>Ensure <strong>Elementor</strong> (free or Pro) is installed and active</li>
              <li>Open any page with the Elementor editor</li>
              <li>Search for <strong>"ROL'OS"</strong> in the widget panel — all 3 widgets appear under the ROL'OS category</li>
              <li>Drag a widget onto your page and configure the controls in the sidebar</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* ── Booking Widget ── */}
      <Card>
        <CardHeader className="cursor-pointer" onClick={() => toggle("booking")}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Calendar className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">ROL'OS Booking Widget</CardTitle>
                <CardDescription className="text-xs">Full booking engine with date selection, room picker, and checkout</CardDescription>
              </div>
            </div>
            {expanded === "booking" ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </CardHeader>
        {expanded === "booking" && (
          <CardContent className="space-y-4">
            {/* Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-lg border border-border bg-muted/20">
              <div className="space-y-2">
                <Label className="text-xs">Brand Colour</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={bwColor} onChange={(e) => setBwColor(e.target.value)} className="w-8 h-8 rounded border-none cursor-pointer" />
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{bwColor}</code>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Layout</Label>
                <Select value={bwLayout} onValueChange={setBwLayout}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">Compact</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="full">Full</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Height: {bwHeight}px</Label>
                <Slider value={[bwHeight]} onValueChange={([v]) => setBwHeight(v)} min={400} max={900} step={50} />
              </div>
            </div>

            {/* Preview */}
            <WidgetPreviewFrame title={`${property.name} — Booking Widget`} url={`yoursite.com/book`} height={Math.min(bwHeight, 500)}>
              <div className="p-4 space-y-3">
                <div className="rounded-lg p-3 text-center text-sm font-semibold text-white" style={{ backgroundColor: bwColor }}>
                  {property.name} — Booking
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 28 }, (_, i) => (
                    <div key={i} className="aspect-square rounded text-[10px] flex items-center justify-center border border-border" style={i >= 8 && i <= 14 ? { backgroundColor: bwColor + "22", color: bwColor } : {}}>
                      {i + 1}
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium">Deluxe Room</div>
                      <div className="text-[10px] text-muted-foreground">2 Guests · King Bed</div>
                    </div>
                    <div className="text-xs font-semibold" style={{ color: bwColor }}>R 1,200 /night</div>
                  </div>
                </div>
                <button className="w-full rounded-lg py-2 text-xs font-semibold text-white" style={{ backgroundColor: bwColor }}>
                  Book Now
                </button>
              </div>
            </WidgetPreviewFrame>

            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs font-normal gap-1">
                <CheckCircle2 className="h-3 w-3 text-primary" /> {bwLayout} layout
              </Badge>
              <Badge variant="secondary" className="text-xs font-normal gap-1">
                <CheckCircle2 className="h-3 w-3 text-primary" /> {bwHeight}px
              </Badge>
            </div>

            <CodeSnippetBlock code={bwShortcode} language="html" title="Booking Widget Shortcode" />

            <Button variant="outline" size="sm" asChild>
              <a href={embedUrl} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" /> Test in New Tab
              </a>
            </Button>
          </CardContent>
        )}
      </Card>

      {/* ── Property Card ── */}
      <Card>
        <CardHeader className="cursor-pointer" onClick={() => toggle("card")}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <ImageIcon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">ROL'OS Property Card</CardTitle>
                <CardDescription className="text-xs">Property summary card with image, pricing, and availability</CardDescription>
              </div>
            </div>
            {expanded === "card" ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </CardHeader>
        {expanded === "card" && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-lg border border-border bg-muted/20">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">Show Price</Label>
                <Switch checked={pcShowPrice} onCheckedChange={setPcShowPrice} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">Show Availability</Label>
                <Switch checked={pcShowAvail} onCheckedChange={setPcShowAvail} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Card Style</Label>
                <Select value={pcStyle} onValueChange={setPcStyle}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minimal">Minimal</SelectItem>
                    <SelectItem value="detailed">Detailed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <WidgetPreviewFrame title="Property Card Preview" url="yoursite.com" height={pcStyle === "minimal" ? 180 : 260}>
              <div className="p-4">
                <div className={`rounded-xl border border-border overflow-hidden ${pcStyle === "detailed" ? "flex flex-col" : "flex items-center gap-3 p-3"}`}>
                  {pcStyle === "detailed" ? (
                    <>
                      <div className="h-28 bg-muted flex items-center justify-center">
                        <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                      </div>
                      <div className="p-3 space-y-1.5">
                        <div className="text-sm font-semibold">{property.name}</div>
                        {pcShowPrice && <div className="text-xs" style={{ color: defaultColor }}>From R 850 /night</div>}
                        {pcShowAvail && (
                          <Badge variant="secondary" className="text-[10px] bg-green-50 text-green-700 border-green-200">
                            Available
                          </Badge>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
                      </div>
                      <div className="space-y-0.5">
                        <div className="text-sm font-semibold">{property.name}</div>
                        {pcShowPrice && <div className="text-xs" style={{ color: defaultColor }}>From R 850 /night</div>}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </WidgetPreviewFrame>

            <CodeSnippetBlock code={pcShortcode} language="html" title="Property Card Shortcode" />
          </CardContent>
        )}
      </Card>

      {/* ── Availability Grid ── */}
      <Card>
        <CardHeader className="cursor-pointer" onClick={() => toggle("grid")}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <LayoutGrid className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">ROL'OS Availability Grid</CardTitle>
                <CardDescription className="text-xs">Multi-month calendar grid showing real-time availability</CardDescription>
              </div>
            </div>
            {expanded === "grid" ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </CardHeader>
        {expanded === "grid" && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-lg border border-border bg-muted/20">
              <div className="space-y-2">
                <Label className="text-xs">Months to Display: {agMonths}</Label>
                <Slider value={[agMonths]} onValueChange={([v]) => setAgMonths(v)} min={1} max={6} step={1} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Colour Scheme</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={agColor} onChange={(e) => setAgColor(e.target.value)} className="w-8 h-8 rounded border-none cursor-pointer" />
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{agColor}</code>
                </div>
              </div>
            </div>

            <WidgetPreviewFrame title="Availability Grid Preview" url="yoursite.com/availability" height={220}>
              <div className="p-4">
                <div className={`grid gap-4 ${agMonths > 2 ? "grid-cols-3" : agMonths === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
                  {Array.from({ length: Math.min(agMonths, 3) }, (_, m) => {
                    const now = new Date();
                    const month = new Date(now.getFullYear(), now.getMonth() + m, 1);
                    const monthName = month.toLocaleString("default", { month: "short", year: "numeric" });
                    return (
                      <div key={m} className="space-y-1">
                        <div className="text-[10px] font-semibold text-center">{monthName}</div>
                        <div className="grid grid-cols-7 gap-0.5">
                          {Array.from({ length: 28 }, (_, d) => {
                            const isAvail = Math.random() > 0.25;
                            return (
                              <div
                                key={d}
                                className="aspect-square rounded-sm text-[7px] flex items-center justify-center"
                                style={{
                                  backgroundColor: isAvail ? agColor + "22" : "transparent",
                                  color: isAvail ? agColor : "var(--muted-foreground)",
                                  border: `1px solid ${isAvail ? agColor + "44" : "var(--border)"}`,
                                }}
                              >
                                {d + 1}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </WidgetPreviewFrame>

            <CodeSnippetBlock code={agShortcode} language="html" title="Availability Grid Shortcode" />
          </CardContent>
        )}
      </Card>
    </div>
  );
}
