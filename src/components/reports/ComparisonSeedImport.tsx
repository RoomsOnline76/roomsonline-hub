import { useCallback, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

/**
 * One-time import of a property's consolidated report spreadsheet. Only the
 * comparison figures are kept — budget, same time last year and last year — and
 * they stay editable afterwards. The file itself is not stored.
 */
export function ComparisonSeedImport({ propertyId }: { propertyId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        const form = new FormData();
        form.append("property_id", propertyId);
        form.append("file", file);
        const { data, error } = await supabase.functions.invoke("report-comparison-import", {
          body: form,
        });
        if (error || data?.error) {
          toast.error("Could not read those figures", {
            description: String(data?.error ?? error?.message ?? ""),
          });
          return;
        }
        const months = Number(data?.months) || 0;
        const years: string[] = Array.isArray(data?.years) ? data.years.map(String) : [];
        setSummary(`${months} month(s) imported${years.length ? ` · ${years.join(", ")}` : ""}`);
        toast.success("Comparison figures imported");
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [propertyId],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Comparison figures</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Budget, same time last year and last year are read once from the consolidated
          spreadsheet you already keep, then stored here. Revenue on the books comes from each
          day's exports. A month with no figure prints a dash.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xlsm,.xls"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          Import from the consolidated spreadsheet
        </Button>
        {summary && <p className="text-xs text-muted-foreground">{summary}</p>}
      </CardContent>
    </Card>
  );
}
