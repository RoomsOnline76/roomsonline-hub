/**
 * Authoritative channel calendar read-back.
 *
 * ROL'OS availability logs can report a successful push while the channel still sells a night
 * (a 365-day "all matched" summary hides a handful of days). This panel reads the channel's own
 * per-day calendar with the property's sub-account credentials and marks every night that ROL'OS
 * has sold but the channel still reports as sellable.
 */
import { useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";

interface VerifyDay {
  date: string;
  units: number | null;
  reservations: number | null;
  min_stay: number | null;
  changeover: number | null;
  sold_on_rolos: boolean;
  channel_closed: boolean;
  conflict: boolean;
}

interface VerifyUnit {
  unit: string;
  unit_id: string | null;
  ru_property_id: number;
  sold_nights?: string[];
  sold_nights_still_open?: number;
  days?: VerifyDay[];
  error?: string;
}

interface Props {
  properties: { id: string; name: string }[];
}

const isoToday = () => new Date().toISOString().slice(0, 10);
const isoPlusDays = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

export function RuCalendarVerifyPanel({ properties }: Props) {
  const [propertyId, setPropertyId] = useState<string>("");
  const [from, setFrom] = useState<string>(isoToday);
  const [to, setTo] = useState<string>(() => isoPlusDays(60));
  const [loading, setLoading] = useState(false);
  const [units, setUnits] = useState<VerifyUnit[] | null>(null);

  const run = useCallback(async () => {
    if (!propertyId) {
      toast.error("Pick a property first");
      return;
    }
    setLoading(true);
    setUnits(null);
    const { data, error } = await supabase.functions.invoke("push-property-to-ru", {
      body: { property_id: propertyId, action: "verify_calendar", date_from: from, date_to: to },
    });
    setLoading(false);
    if (error || data?.success === false) {
      toast.error(error?.message || data?.error?.message || "Channel read-back failed");
      return;
    }
    setUnits(Array.isArray(data?.units) ? (data.units as VerifyUnit[]) : []);
  }, [propertyId, from, to]);

  const conflicts = useMemo(
    () => (units ?? []).reduce((sum, u) => sum + (u.sold_nights_still_open ?? 0), 0),
    [units],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Verify channel calendar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Reads the channel's live per-day calendar with the property's own sub-account keys and
          compares it against the nights sold in ROL'OS. Read-only — nothing is pushed.
        </p>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2 space-y-1.5">
            <Label>Property</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a property" />
              </SelectTrigger>
              <SelectContent>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ru-verify-from">From</Label>
            <Input id="ru-verify-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ru-verify-to">To</Label>
            <Input id="ru-verify-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <Button onClick={run} disabled={loading || !propertyId}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Read channel calendar
        </Button>

        {units && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              {conflicts === 0 ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span>Every night sold in ROL'OS is closed at the channel.</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="font-medium">
                    {conflicts} sold night{conflicts === 1 ? "" : "s"} still sellable at the channel
                  </span>
                </>
              )}
            </div>

            {units.length === 0 && (
              <p className="text-sm text-muted-foreground">No live channel listing for this property.</p>
            )}

            {units.map((u) => {
              const openDays = (u.days ?? []).filter((d) => d.conflict);
              return (
                <div key={`${u.ru_property_id}-${u.unit_id ?? "prop"}`} className="rounded-lg border p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{u.unit}</span>
                    <Badge variant="outline">Channel ID {u.ru_property_id}</Badge>
                    <Badge variant="outline">{u.sold_nights?.length ?? 0} sold night(s)</Badge>
                    {u.error ? (
                      <Badge variant="destructive">{u.error}</Badge>
                    ) : openDays.length > 0 ? (
                      <Badge variant="destructive">{openDays.length} still open</Badge>
                    ) : (
                      <Badge variant="secondary">In sync</Badge>
                    )}
                  </div>

                  {openDays.length > 0 && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Open despite being sold: </span>
                      {openDays.map((d) => d.date).join(", ")}
                    </div>
                  )}

                  {(u.days?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {u.days!.map((d) => (
                        <span
                          key={d.date}
                          title={`${d.date} — channel units ${d.units ?? "?"}, reservations ${d.reservations ?? 0}, min stay ${d.min_stay ?? "?"}`}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${
                            d.conflict
                              ? "bg-destructive text-destructive-foreground"
                              : d.sold_on_rolos
                                ? "bg-primary text-primary-foreground"
                                : d.channel_closed
                                  ? "bg-muted text-muted-foreground"
                                  : "bg-secondary text-secondary-foreground"
                          }`}
                        >
                          {d.date.slice(5)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default RuCalendarVerifyPanel;
