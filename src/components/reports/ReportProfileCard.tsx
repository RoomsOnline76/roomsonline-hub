import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { ReportProfile } from "@/lib/reportProfile";

interface Props {
  profile: ReportProfile;
  onChange: (next: ReportProfile) => void;
}

/** "2026, 2025, 2024" -> [2026, 2025, 2024] */
const parseYears = (value: string): number[] => {
  const seen = new Set<number>();
  for (const entry of value.split(/[,\s]+/)) {
    const year = Number(entry.trim());
    if (Number.isInteger(year) && year >= 2000 && year <= 2100) seen.add(year);
  }
  return [...seen].sort((a, b) => b - a);
};

/**
 * Presentation quirks that are true of the *property*, not of its PMS: which
 * calendar years the owner's pack prints beside the current OTB column, where
 * same-time-last-year comes from, and whether a PMS extract exists at all.
 *
 * Off/empty here means the property keeps today's behaviour — current OTB,
 * previous review and last-year actual.
 */
export function ReportProfileCard({ profile, onChange }: Props) {
  const patch = (next: Partial<ReportProfile>) => onChange({ ...profile, ...next });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Comparison columns</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="compare-years">Comparison years</Label>
          <Input
            id="compare-years"
            value={profile.compare_years.join(", ")}
            onChange={(e) => patch({ compare_years: parseYears(e.target.value) })}
            placeholder="2026, 2025, 2024"
          />
          <p className="text-xs text-muted-foreground">
            Calendar years printed as actuals beside the current on-the-books column, month
            aligned. Leave blank for the standard last-year-only comparison.
          </p>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="year-columns">Print the extra year columns</Label>
            <p className="text-xs text-muted-foreground">
              Adds a column per comparison year (and same-time-last-year) to the workbook and
              the draft pack. Off keeps the source's standard column order.
            </p>
          </div>
          <Switch
            id="year-columns"
            checked={profile.year_columns}
            onCheckedChange={(checked) => patch({ year_columns: checked })}
          />
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="stly-prior">Same-time-last-year from the prior workbook</Label>
            <p className="text-xs text-muted-foreground">
              Takes STLY off the revenue report that was sent same-time-last-year. Makes the
              prior-workbook import a required step on the run wizard.
            </p>
          </div>
          <Switch
            id="stly-prior"
            checked={profile.stly_from_prior_workbook}
            onCheckedChange={(checked) => patch({ stly_from_prior_workbook: checked })}
          />
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="source-unavailable">No PMS extract (use the last sent report)</Label>
            <p className="text-xs text-muted-foreground">
              For properties whose PMS exposes no downloadable ledger. The wizard asks only for
              the last sent revenue workbook and builds the run from it.
            </p>
          </div>
          <Switch
            id="source-unavailable"
            checked={profile.source_unavailable}
            onCheckedChange={(checked) =>
              patch({
                source_unavailable: checked,
                source_mode: checked ? "prior_workbook_only" : "ledger",
              })
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
