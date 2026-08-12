/**
 * ChangeoverRulesCard — authoring surface for the channel changeover rule.
 *
 * The Channel Manager expects, per listing, which days a stay may start and/or end.
 * Until this was authored in ROL'OS the push sent an assumed "arrival and departure any
 * day", which the onboarding gate now blocks (`changeover_authored`).
 *
 * A property-level master rule is mandatory; per-day overrides and per-unit overrides
 * (authored in the Rooms tab) are optional refinements.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CalendarClock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { channelMandatoryClass } from "@/lib/channelMandatoryFields";
import {
  CHANGEOVER_CODES,
  CHANGEOVER_DOW_KEYS,
  CHANGEOVER_DOW_LABELS,
  changeoverCodeLabel,
  type ChangeoverDowKey,
} from "@/config/channelPropertyTypes";

export interface ChangeoverRulesCardProps {
  /** Master changeover code (0-3) or null when not authored. */
  master: number | null;
  onMasterChange: (next: number | null) => void;
  /** Per-day overrides keyed by lowercase day name. */
  rules: Partial<Record<ChangeoverDowKey, number>>;
  onRulesChange: (next: Partial<Record<ChangeoverDowKey, number>>) => void;
  /** Units with their own override, for transparency. */
  unitOverrides?: Array<{ name: string; changeover: number }>;
}

export function ChangeoverRulesCard({
  master,
  onMasterChange,
  rules,
  onRulesChange,
  unitOverrides = [],
}: ChangeoverRulesCardProps) {
  const authored = master !== null && master !== undefined;
  // Collapsed once the mandatory master rule is set, so the tab only shows open work.
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  useEffect(() => {
    if (!authored) setOpenOverride(null);
  }, [authored]);
  const open = openOverride ?? !authored;

  const setDay = (day: ChangeoverDowKey, value: string) => {
    const next = { ...rules };
    if (value === "inherit") delete next[day];
    else next[day] = Number(value);
    onRulesChange(next);
  };

  return (
    <Card id="changeover_rules">
      <CardHeader className="p-3 pb-2">
        <button type="button" onClick={() => setOpenOverride(!open)} aria-expanded={open} className="w-full text-left">
          <CardTitle className="flex items-center gap-2 text-sm">
            <CalendarClock className="h-4 w-4 text-primary" />
            Changeover — arrival &amp; departure rules
            {authored && (
              <span className="ml-auto flex items-center gap-1 text-[10px] font-normal text-muted-foreground">
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                {changeoverCodeLabel(master)}
                <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
              </span>
            )}
          </CardTitle>
        </button>
      </CardHeader>
      {open && (
      <CardContent className="space-y-3 p-3 pt-0">


        <div className="space-y-1">
          <Label className="text-xs">Property master rule</Label>
          <Select
            value={authored ? String(master) : undefined}
            onValueChange={(v) => onMasterChange(Number(v))}
          >
            <SelectTrigger
              data-field="changeover_rules"
              data-channel-satisfied={authored ? "1" : "0"} data-req-live="1"
              className={cn("h-8 text-xs", channelMandatoryClass("changeover_rules"))}
            >
              <SelectValue placeholder="Required — select a changeover rule" />
            </SelectTrigger>
            <SelectContent>
              {CHANGEOVER_CODES.map((c) => (
                <SelectItem key={c.value} value={String(c.value)} className="text-xs">
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {authored ? (
            <p className="flex items-center gap-1 text-[10px] text-emerald-600">
              <CheckCircle2 className="h-3 w-3" />
              Master rule authored — {changeoverCodeLabel(master)}.
            </p>
          ) : (
            <p className="flex items-center gap-1 text-[10px] text-destructive">
              <AlertTriangle className="h-3 w-3" />
              Required: pick the rule that applies to this property.
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Per-day overrides (optional)</Label>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {CHANGEOVER_DOW_KEYS.map((day) => (
              <div key={day} className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-[11px] text-muted-foreground">
                  {CHANGEOVER_DOW_LABELS[day]}
                </span>
                <Select
                  value={rules[day] === undefined ? "inherit" : String(rules[day])}
                  onValueChange={(v) => setDay(day, v)}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inherit" className="text-xs">
                      Use master rule
                    </SelectItem>
                    {CHANGEOVER_CODES.map((c) => (
                      <SelectItem key={c.value} value={String(c.value)} className="text-xs">
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>

        {unitOverrides.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs">Units with their own rule</Label>
            <div className="flex flex-wrap gap-1">
              {unitOverrides.map((u) => (
                <Badge key={u.name} variant="outline" className="text-[10px]">
                  {u.name}: {changeoverCodeLabel(u.changeover)}
                </Badge>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Every other unit inherits the property master rule.
            </p>
          </div>
        )}
      </CardContent>
      )}
    </Card>
  );
}

export default ChangeoverRulesCard;
