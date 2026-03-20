import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SmartButtonConfig {
  default_cta_text: string;
  default_solution: string;
  allowed_styles: string[];
  allowed_sizes: string[];
}

const ALL_STYLES = ["solid", "outline", "ghost", "gradient"];
const ALL_SIZES = ["sm", "md", "lg", "xl"];

const DEFAULT: SmartButtonConfig = {
  default_cta_text: "Book Now",
  default_solution: "booking_widget",
  allowed_styles: ["solid", "outline"],
  allowed_sizes: ["sm", "md", "lg"],
};

interface Props {
  config: SmartButtonConfig;
  onChange: (config: SmartButtonConfig) => void;
}

export function SmartButtonConfigTab({ config, onChange }: Props) {
  const c = { ...DEFAULT, ...config };

  const toggleList = (field: "allowed_styles" | "allowed_sizes", val: string) => {
    const list = c[field].includes(val) ? c[field].filter((v) => v !== val) : [...c[field], val];
    onChange({ ...c, [field]: list });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Button Defaults</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label className="text-xs">Default CTA Text</Label><Input value={c.default_cta_text} onChange={(e) => onChange({ ...c, default_cta_text: e.target.value })} /></div>
          <div><Label className="text-xs">Default Solution</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={c.default_solution} onChange={(e) => onChange({ ...c, default_solution: e.target.value })}>
              <option value="booking_widget">Booking Widget</option>
              <option value="availability_calendar">Availability Calendar</option>
              <option value="direct_link">Direct Link</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Allowed Styles</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {ALL_STYLES.map((s) => (
              <div key={s} className="flex items-center gap-2">
                <Switch checked={c.allowed_styles.includes(s)} onCheckedChange={() => toggleList("allowed_styles", s)} />
                <Label className="text-xs capitalize">{s}</Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Allowed Sizes</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {ALL_SIZES.map((s) => (
              <div key={s} className="flex items-center gap-2">
                <Switch checked={c.allowed_sizes.includes(s)} onCheckedChange={() => toggleList("allowed_sizes", s)} />
                <Label className="text-xs uppercase">{s}</Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export type { SmartButtonConfig };
export { DEFAULT as SMART_BUTTON_DEFAULTS };
