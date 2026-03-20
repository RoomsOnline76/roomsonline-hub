import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface EmbedConfig {
  calendar_months: number;
  date_format: string;
  booking_bar_layout: string;
  availability_columns: number;
  custom_css: string;
}

const DEFAULT: EmbedConfig = {
  calendar_months: 2,
  date_format: "DD/MM/YYYY",
  booking_bar_layout: "horizontal",
  availability_columns: 7,
  custom_css: "",
};

interface Props {
  config: EmbedConfig;
  onChange: (config: EmbedConfig) => void;
}

export function EmbedConfigTab({ config, onChange }: Props) {
  const c = { ...DEFAULT, ...config };
  const update = (field: string, value: unknown) => onChange({ ...c, [field]: value });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Calendar & Availability</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Months Displayed</Label><Input type="number" min={1} max={6} value={c.calendar_months} onChange={(e) => update("calendar_months", parseInt(e.target.value))} /></div>
            <div><Label className="text-xs">Date Format</Label><Input value={c.date_format} onChange={(e) => update("date_format", e.target.value)} /></div>
            <div><Label className="text-xs">Availability Columns</Label><Input type="number" min={1} max={14} value={c.availability_columns} onChange={(e) => update("availability_columns", parseInt(e.target.value))} /></div>
            <div><Label className="text-xs">Booking Bar Layout</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={c.booking_bar_layout} onChange={(e) => update("booking_bar_layout", e.target.value)}>
                <option value="horizontal">Horizontal</option>
                <option value="vertical">Vertical</option>
                <option value="compact">Compact</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Custom CSS Overrides</CardTitle></CardHeader>
        <CardContent>
          <Textarea value={c.custom_css} onChange={(e) => update("custom_css", e.target.value)} placeholder="/* Custom CSS for embed widgets */" className="font-mono text-xs min-h-[120px]" />
        </CardContent>
      </Card>
    </div>
  );
}

export type { EmbedConfig };
export { DEFAULT as EMBED_DEFAULTS };
