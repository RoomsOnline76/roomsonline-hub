import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WpAdminConfig {
  tabs: {
    metrics: { enabled: boolean; label: string };
    housekeeping: { enabled: boolean; label: string };
    checkin_checkout: { enabled: boolean; label: string };
    folios: { enabled: boolean; label: string };
  };
  metric_cards: string[];
}

const ALL_METRIC_CARDS = ["occupancy", "revenue", "adr", "revpar", "arrivals", "departures", "in_house"];

const DEFAULT: WpAdminConfig = {
  tabs: {
    metrics: { enabled: true, label: "Metrics" },
    housekeeping: { enabled: true, label: "Housekeeping" },
    checkin_checkout: { enabled: true, label: "Check-in / Check-out" },
    folios: { enabled: true, label: "Folios" },
  },
  metric_cards: ALL_METRIC_CARDS,
};

interface Props {
  config: WpAdminConfig;
  onChange: (config: WpAdminConfig) => void;
}

export function WpAdminConfigTab({ config, onChange }: Props) {
  const c = { ...DEFAULT, ...config, tabs: { ...DEFAULT.tabs, ...config?.tabs } };

  const updateTab = (key: keyof typeof c.tabs, field: string, value: unknown) => {
    onChange({ ...c, tabs: { ...c.tabs, [key]: { ...c.tabs[key], [field]: value } } });
  };

  const toggleMetricCard = (card: string) => {
    const cards = c.metric_cards.includes(card)
      ? c.metric_cards.filter((m) => m !== card)
      : [...c.metric_cards, card];
    onChange({ ...c, metric_cards: cards });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Dashboard Tabs</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(Object.keys(c.tabs) as Array<keyof typeof c.tabs>).map((key) => (
            <div key={key} className="flex items-center gap-3">
              <Switch checked={c.tabs[key].enabled} onCheckedChange={(v) => updateTab(key, "enabled", v)} />
              <Input value={c.tabs[key].label} onChange={(e) => updateTab(key, "label", e.target.value)} className="max-w-[200px]" />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Visible Metric Cards</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {ALL_METRIC_CARDS.map((card) => (
              <div key={card} className="flex items-center gap-2">
                <Switch checked={c.metric_cards.includes(card)} onCheckedChange={() => toggleMetricCard(card)} />
                <Label className="text-xs capitalize">{card.replace("_", " ")}</Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export type { WpAdminConfig };
export { DEFAULT as WP_ADMIN_DEFAULTS };
