import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export interface RepTier {
  min_props: number;
  min_mrr: number;
  first_year_rate: number;
  residual_rate: number;
  notes: string;
}

export type RepTierCriteria = {
  base: RepTier;
  accelerated: RepTier;
  elite: RepTier;
};

export const DEFAULT_TIER_CRITERIA: RepTierCriteria = {
  base:        { min_props: 0,  min_mrr: 0,     first_year_rate: 20, residual_rate: 5,   notes: "Entry tier — every rep starts here." },
  accelerated: { min_props: 10, min_mrr: 15000, first_year_rate: 25, residual_rate: 7.5, notes: "Reached after consistently producing signed properties." },
  elite:       { min_props: 25, min_mrr: 40000, first_year_rate: 30, residual_rate: 10,  notes: "Top producers / strategic partners." },
};

const TIERS: Array<{ key: keyof RepTierCriteria; label: string; tone: "secondary" | "default" | "outline" }> = [
  { key: "base", label: "Base", tone: "secondary" },
  { key: "accelerated", label: "Accelerated", tone: "default" },
  { key: "elite", label: "Elite", tone: "outline" },
];

interface Props {
  value: RepTierCriteria;
  onChange: (v: RepTierCriteria) => void;
}

export function TierCriteriaEditor({ value, onChange }: Props) {
  const update = (key: keyof RepTierCriteria, patch: Partial<RepTier>) => {
    onChange({ ...value, [key]: { ...value[key], ...patch } });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Reps automatically move between tiers based on the criteria below. First-year and residual rates on each tier
        override the strategy defaults.
      </p>
      {TIERS.map(({ key, label, tone }) => {
        const t = value[key];
        return (
          <div key={key} className="rounded-md border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Badge variant={tone}>{label}</Badge>
              <span className="text-[10px] text-muted-foreground">
                ≥ {t.min_props} props · ≥ R{t.min_mrr.toLocaleString()} MRR
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px]">Min properties</Label>
                <Input type="number" min="0" value={t.min_props}
                  onChange={(e) => update(key, { min_props: parseInt(e.target.value) || 0 })}
                  className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Min MRR (ZAR)</Label>
                <Input type="number" min="0" step="500" value={t.min_mrr}
                  onChange={(e) => update(key, { min_mrr: parseFloat(e.target.value) || 0 })}
                  className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">First-year %</Label>
                <Input type="number" min="0" max="100" step="0.5" value={t.first_year_rate}
                  onChange={(e) => update(key, { first_year_rate: parseFloat(e.target.value) || 0 })}
                  className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Residual %</Label>
                <Input type="number" min="0" max="100" step="0.5" value={t.residual_rate}
                  onChange={(e) => update(key, { residual_rate: parseFloat(e.target.value) || 0 })}
                  className="h-8 text-xs" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Criteria / Notes</Label>
              <Textarea rows={2} value={t.notes}
                onChange={(e) => update(key, { notes: e.target.value })}
                className="text-xs" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
