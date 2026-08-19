import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

const STORAGE_KEY = "rolos.ru-cert-checklist";

/** Manual cert walkthrough. Purely visual: nothing here reads or writes channel state. */
const STEPS: Array<{ id: string; label: string; hint: string }> = [
  { id: "company", label: "Company details pushed", hint: "Push_FillCompanyDetails_RQ accepted for every sub-account." },
  { id: "keys", label: "Sub-account API keys verified", hint: "Each sub-user AccessKey / SecretKey authenticates." },
  { id: "binding", label: "Property binding confirmed", hint: "Every property maps to the right listing and building." },
  { id: "mapping", label: "Room & rate mapping confirmed", hint: "Room types and rate plans resolve to live listings." },
  { id: "availability", label: "Availability pushed", hint: "Rolling window pushed and read back per unit." },
  { id: "pricing", label: "Pricing coverage complete", hint: "365 nights priced with no gaps." },
  { id: "res-create", label: "Reservation created", hint: "Inbound reservation ingested and visible in ROL'OS." },
  { id: "res-modify", label: "Reservation modified", hint: "Stay change redrawn on the dashboard." },
  { id: "res-cancel", label: "Cancel / reject logged", hint: "Cancellation lifts blocks and is recorded in the log." },
  { id: "evidence", label: "Log evidence exportable", hint: "Exchange log shows request, response and ResponseID." },
];

export function RuCertChecklistCard() {
  const [ticked, setTicked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setTicked(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      // Corrupt or unavailable storage just means an empty checklist.
    }
  }, []);

  const persist = useCallback((next: Record<string, boolean>) => {
    setTicked(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Non-fatal: the checklist still works for this session.
    }
  }, []);

  const done = STEPS.filter((s) => ticked[s.id]).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
              RU cert checklist
            </CardTitle>
            <CardDescription>
              Manual walkthrough for the certification call — ticks are local notes only and change nothing on the
              channel.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={done === STEPS.length ? "default" : "outline"}>
              {done}/{STEPS.length} ticked
            </Badge>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => persist({})} disabled={done === 0}>
              <RotateCcw className="mr-1.5 h-3 w-3" />
              Reset
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {STEPS.map((step) => (
          <label
            key={step.id}
            className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-muted/20 p-2.5"
          >
            <Checkbox
              checked={!!ticked[step.id]}
              onCheckedChange={(v) => persist({ ...ticked, [step.id]: v === true })}
              className="mt-0.5"
            />
            <span className="min-w-0">
              <span className="block text-xs font-medium">{step.label}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{step.hint}</span>
            </span>
          </label>
        ))}
      </CardContent>
    </Card>
  );
}
