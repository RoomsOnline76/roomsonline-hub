import { useMemo, useRef, useState } from "react";
import { ChevronDown, Download, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  MONTH_LABELS,
  addBaselineYear,
  baselineToCsv,
  baselineYears,
  monthKey,
  parseBaselineCsv,
  removeBaselineYear,
  setBaselineCell,
  mergeBaselineRows,
  type HistoricalBaseline,
} from "@/lib/historicalBaseline";

interface Props {
  baseline: HistoricalBaseline;
  roomCount: number;
  onChange: (next: HistoricalBaseline) => void;
}

const money = (value: number): string =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value || 0);

const daysInMonth = (year: number, month: number): number =>
  new Date(year, month, 0).getDate();

/** Year-by-month editor for last-year actuals with CSV import / export. */
export function HistoricalBaselineEditor({ baseline, roomCount, onChange }: Props) {
  const years = useMemo(() => baselineYears(baseline), [baseline]);
  const [activeYear, setActiveYear] = useState<number | null>(null);
  const [csvText, setCsvText] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const year = activeYear ?? years[years.length - 1] ?? new Date().getFullYear() - 1;

  const rows = useMemo(
    () =>
      MONTH_LABELS.map((label, index) => {
        const key = monthKey(year, index + 1);
        const revenue = baseline.revenue?.[key];
        const nights = baseline.room_nights?.[key];
        const capacity = Math.max(roomCount, 1) * daysInMonth(year, index + 1);
        return {
          key,
          label,
          revenue,
          nights,
          adr: nights ? (revenue ?? 0) / nights : null,
          occupancy: nights ? nights / capacity : null,
          source: baseline.sources?.[key] ?? null,
        };
      }),
    [baseline, roomCount, year],
  );

  const totals = useMemo(() => {
    const revenue = rows.reduce((sum, row) => sum + (row.revenue ?? 0), 0);
    const nights = rows.reduce((sum, row) => sum + (row.nights ?? 0), 0);
    return { revenue, nights };
  }, [rows]);

  const applyCsv = (text: string, mode: "merge" | "replace") => {
    const { rows: parsed, errors } = parseBaselineCsv(text);
    if (parsed.length === 0) {
      toast.error("Nothing to import", { description: errors[0] });
      return;
    }
    onChange(mergeBaselineRows(baseline, parsed, mode));
    setCsvText("");
    setImportOpen(false);
    toast.success(`${parsed.length} month(s) imported`, {
      description: errors.length ? `${errors.length} line(s) skipped.` : "Remember to save.",
    });
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    applyCsv(text, "merge");
  };

  const handleExport = () => {
    const blob = new Blob([baselineToCsv(baseline)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "historical-baseline.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {years.map((item) => (
          <Button
            key={item}
            type="button"
            size="sm"
            variant={item === year ? "default" : "outline"}
            onClick={() => setActiveYear(item)}
          >
            {item}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            const next = (years[years.length - 1] ?? new Date().getFullYear() - 1) + 1;
            onChange(addBaselineYear(baseline, next));
            setActiveYear(next);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add year
        </Button>
        {years.includes(year) && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              onChange(removeBaselineYear(baseline, year));
              setActiveYear(null);
            }}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Remove {year}
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[36rem]">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Month</th>
              <th className="py-2 px-3 font-medium">Revenue</th>
              <th className="py-2 px-3 font-medium">Room nights</th>
              <th className="py-2 px-3 font-medium text-right">ADR</th>
              <th className="py-2 px-3 font-medium text-right">Occupancy</th>
              <th className="py-2 pl-3 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b last:border-0">
                <td className="py-1.5 pr-3 font-medium">{row.label}</td>
                <td className="py-1.5 px-3">
                  <Input
                    type="number"
                    inputMode="decimal"
                    className="h-8"
                    value={row.revenue ?? ""}
                    onChange={(e) =>
                      onChange(
                        setBaselineCell(
                          baseline,
                          row.key,
                          "revenue",
                          e.target.value.trim() === "" ? null : Number(e.target.value),
                        ),
                      )
                    }
                    aria-label={`${row.label} ${year} revenue`}
                  />
                </td>
                <td className="py-1.5 px-3">
                  <Input
                    type="number"
                    inputMode="numeric"
                    className="h-8"
                    value={row.nights ?? ""}
                    onChange={(e) =>
                      onChange(
                        setBaselineCell(
                          baseline,
                          row.key,
                          "room_nights",
                          e.target.value.trim() === "" ? null : Number(e.target.value),
                        ),
                      )
                    }
                    aria-label={`${row.label} ${year} room nights`}
                  />
                </td>
                <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">
                  {row.adr === null ? "—" : money(row.adr)}
                </td>
                <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">
                  {row.occupancy === null ? "—" : `${(row.occupancy * 100).toFixed(1)}%`}
                </td>
                <td className="py-1.5 pl-3">
                  {row.source && (
                    <Badge variant="secondary" className="font-normal">
                      {row.source === "run" ? "From run" : "Manual"}
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
            <tr className="font-medium">
              <td className="py-2 pr-3">Total</td>
              <td className="py-2 px-3 tabular-nums">{money(totals.revenue)}</td>
              <td className="py-2 px-3 tabular-nums">{totals.nights}</td>
              <td colSpan={3} />
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setImportOpen((v) => !v)}>
          <Upload className="h-4 w-4 mr-2" />
          Import CSV / paste
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
      </div>

      {importOpen && (
        <div className="space-y-2 rounded-md border p-3">
          <Label htmlFor="baseline-csv">Paste rows as year,month,revenue,room_nights</Label>
          <Textarea
            id="baseline-csv"
            rows={5}
            className="font-mono text-xs"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={"2024,Jul,343388.91,145\n2024,08,298000,132"}
          />
          <div className="flex flex-wrap gap-2 justify-end">
            <Button type="button" size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
              Choose a .csv file
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => applyCsv(csvText, "replace")}
              disabled={!csvText.trim()}
            >
              Replace all
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => applyCsv(csvText, "merge")}
              disabled={!csvText.trim()}
            >
              Merge
            </Button>
          </div>
        </div>
      )}

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="text-muted-foreground">
            <ChevronDown className={cn("h-4 w-4 mr-2 transition-transform", advancedOpen && "rotate-180")} />
            Advanced (raw JSON)
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <Textarea
            rows={8}
            className="font-mono text-xs"
            value={JSON.stringify(baseline ?? {}, null, 2)}
            onChange={(e) => {
              try {
                onChange(JSON.parse(e.target.value) as HistoricalBaseline);
              } catch {
                /* keep the last valid value while the user types */
              }
            }}
            spellCheck={false}
            aria-label="Historical baseline JSON"
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
