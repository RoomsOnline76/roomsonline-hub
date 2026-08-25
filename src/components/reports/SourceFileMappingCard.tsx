import { useMemo, useState } from "react";
import { Loader2, TableProperties } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReportSourceFile } from "@/hooks/useReportRuns";

/** Fields the reviewer can point at a column. Order drives the form layout. */
const FIELDS: Array<{ key: string; label: string; hint?: string; required?: boolean }> = [
  { key: "arrival", label: "Arrival date", required: true },
  { key: "last_night", label: "Last night / departure", hint: "Used to derive nights when absent." },
  { key: "nights", label: "Nights" },
  { key: "revenue", label: "Revenue", required: true },
  { key: "nett", label: "Nett", hint: "Revenue is derived from nett + commission when needed." },
  { key: "commission", label: "Commission" },
  { key: "extras", label: "Extras" },
  { key: "room_name", label: "Room / unit" },
  { key: "source", label: "Source / channel" },
  { key: "status", label: "Status" },
  { key: "booking_id", label: "Booking reference" },
  { key: "type", label: "Type" },
  { key: "currency", label: "Currency" },
];

const NONE = "__none__";

interface Props {
  file: ReportSourceFile;
  busy: boolean;
  onApply: (fileId: string, mapping: Record<string, number>, sheet: string | null) => void;
}

/**
 * Shown when the parser could not confidently recognise a NightsBridge export's
 * columns. The reviewer maps them once and the choice is remembered for the
 * property's future files with the same layout.
 */
export function SourceFileMappingCard({ file, busy, onApply }: Props) {
  const headers = file.detectedMapping?.headers ?? [];
  const samples = file.detectedMapping?.sample_rows ?? [];
  const detected = file.detectedMapping?.fields ?? {};

  const [choice, setChoice] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of FIELDS) {
      const column = detected[field.key]?.column;
      initial[field.key] = typeof column === "number" ? String(column) : NONE;
    }
    return initial;
  });

  const columnLabels = useMemo(
    () =>
      headers.map((header, index) => {
        const sample = samples.find((row) => (row?.[index] ?? "").trim())?.[index] ?? "";
        const name = header.trim() || `Column ${index + 1}`;
        return { value: String(index), label: sample ? `${name} — e.g. ${sample}` : name };
      }),
    [headers, samples],
  );

  const missingRequired = FIELDS.filter(
    (field) => field.required && choice[field.key] === NONE,
  ).map((field) => field.label);

  const apply = () => {
    const mapping: Record<string, number> = {};
    for (const [key, value] of Object.entries(choice)) {
      if (value !== NONE) mapping[key] = Number(value);
    }
    onApply(file.id, mapping, file.sheetUsed);
  };

  return (
    <Card className="border-amber-500/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <TableProperties className="h-4 w-4" />
          Map the columns — {file.originalFilename}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          This export's layout was not recognised automatically
          {file.sheetUsed ? ` (sheet "${file.sheetUsed}")` : ""}. Point each field at the right
          column — the choice is saved for this property's future files with the same headings.
        </p>

        {headers.length === 0 ? (
          <p className="text-sm text-destructive">
            No header row could be read from this file, so it cannot be mapped. Re-export it or
            upload it as a previous report instead.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label className="text-xs">
                    {field.label}
                    {field.required && <span className="text-destructive"> *</span>}
                  </Label>
                  <Select
                    value={choice[field.key]}
                    onValueChange={(value) =>
                      setChoice((prev) => ({ ...prev, [field.key]: value }))
                    }
                    disabled={busy}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Not in this file" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Not in this file</SelectItem>
                      {columnLabels.map((column) => (
                        <SelectItem key={column.value} value={column.value}>
                          {column.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {field.hint && (
                    <p className="text-[11px] text-muted-foreground">{field.hint}</p>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {missingRequired.length
                  ? `Still needed: ${missingRequired.join(", ")}`
                  : "Ready to read with this mapping."}
              </p>
              <Button onClick={apply} disabled={busy || missingRequired.length > 0}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Apply mapping
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
