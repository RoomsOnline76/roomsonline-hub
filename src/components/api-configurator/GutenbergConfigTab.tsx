import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface GutenbergConfig {
  booking_widget: { enabled: boolean; default_height: string; brand_color: string; cta_label: string };
  property_explorer: { enabled: boolean; columns: number; show_filters: boolean };
  property_card: { enabled: boolean; show_price: boolean; show_rating: boolean };
}

const DEFAULT: GutenbergConfig = {
  booking_widget: { enabled: true, default_height: "600", brand_color: "#1a1a2e", cta_label: "Book Now" },
  property_explorer: { enabled: true, columns: 3, show_filters: true },
  property_card: { enabled: true, show_price: true, show_rating: true },
};

interface Props {
  config: GutenbergConfig;
  onChange: (config: GutenbergConfig) => void;
}

export function GutenbergConfigTab({ config, onChange }: Props) {
  const c = { ...DEFAULT, ...config };

  const updateBlock = <K extends keyof GutenbergConfig>(block: K, field: string, value: unknown) => {
    onChange({ ...c, [block]: { ...c[block], [field]: value } });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Booking Widget</CardTitle>
            <Switch checked={c.booking_widget.enabled} onCheckedChange={(v) => updateBlock("booking_widget", "enabled", v)} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Default Height (px)</Label><Input value={c.booking_widget.default_height} onChange={(e) => updateBlock("booking_widget", "default_height", e.target.value)} /></div>
            <div><Label className="text-xs">Brand Color</Label><Input type="color" value={c.booking_widget.brand_color} onChange={(e) => updateBlock("booking_widget", "brand_color", e.target.value)} className="h-10" /></div>
          </div>
          <div><Label className="text-xs">CTA Label</Label><Input value={c.booking_widget.cta_label} onChange={(e) => updateBlock("booking_widget", "cta_label", e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Property Explorer</CardTitle>
            <Switch checked={c.property_explorer.enabled} onCheckedChange={(v) => updateBlock("property_explorer", "enabled", v)} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Grid Columns</Label><Input type="number" min={1} max={6} value={c.property_explorer.columns} onChange={(e) => updateBlock("property_explorer", "columns", parseInt(e.target.value))} /></div>
            <div className="flex items-center gap-2 pt-5"><Switch checked={c.property_explorer.show_filters} onCheckedChange={(v) => updateBlock("property_explorer", "show_filters", v)} /><Label className="text-xs">Show Filters</Label></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Property Card</CardTitle>
            <Switch checked={c.property_card.enabled} onCheckedChange={(v) => updateBlock("property_card", "enabled", v)} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-6">
            <div className="flex items-center gap-2"><Switch checked={c.property_card.show_price} onCheckedChange={(v) => updateBlock("property_card", "show_price", v)} /><Label className="text-xs">Show Price</Label></div>
            <div className="flex items-center gap-2"><Switch checked={c.property_card.show_rating} onCheckedChange={(v) => updateBlock("property_card", "show_rating", v)} /><Label className="text-xs">Show Rating</Label></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export type { GutenbergConfig };
export { DEFAULT as GUTENBERG_DEFAULTS };
