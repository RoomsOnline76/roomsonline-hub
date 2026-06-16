import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowDownLeft, ArrowUpRight, TrendingUp } from "lucide-react";
import { useShareAttributions } from "@/hooks/usePortfolioRevenueShare";
import { formatDistanceToNow } from "date-fns";

interface Props {
  propertyId: string;
}

type Period = "7d" | "30d" | "90d" | "ytd";

function periodToRange(p: Period): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (p === "7d") from.setDate(from.getDate() - 7);
  else if (p === "30d") from.setDate(from.getDate() - 30);
  else if (p === "90d") from.setDate(from.getDate() - 90);
  else from.setMonth(0, 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function CrossPropertyPipelineCard({ propertyId }: Props) {
  const [period, setPeriod] = useState<Period>("30d");
  const range = useMemo(() => periodToRange(period), [period]);
  const { data: attrs = [] } = useShareAttributions({ propertyId, from: range.from, to: range.to });

  const earned = attrs.filter((a) => a.from_property_id === propertyId);
  const owed = attrs.filter((a) => a.to_property_id === propertyId && a.from_property_id !== propertyId);
  const earnedTotal = earned.reduce((s, a) => s + Number(a.share_amount), 0);
  const owedTotal = owed.reduce((s, a) => s + Number(a.share_amount), 0);
  const currency = attrs[0]?.currency ?? "ZAR";

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Cross-Property Bookings</CardTitle>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">7 days</SelectItem>
            <SelectItem value="30d">30 days</SelectItem>
            <SelectItem value="90d">90 days</SelectItem>
            <SelectItem value="ytd">YTD</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-md bg-muted/30 border border-border">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"><ArrowDownLeft className="h-3 w-3" /> Earned</div>
            <p className="text-lg font-semibold mt-1">{currency} {earnedTotal.toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground">{earned.length} booking{earned.length === 1 ? "" : "s"}</p>
          </div>
          <div className="p-3 rounded-md bg-muted/30 border border-border">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"><ArrowUpRight className="h-3 w-3" /> Owed to others</div>
            <p className="text-lg font-semibold mt-1">{currency} {owedTotal.toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground">{owed.length} booking{owed.length === 1 ? "" : "s"}</p>
          </div>
        </div>
        {attrs.length > 0 && (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {attrs.slice(0, 8).map((a) => {
              const isEarned = a.from_property_id === propertyId;
              return (
                <div key={a.id} className="flex items-center justify-between text-xs p-2 rounded-md hover:bg-muted/30">
                  <div className="flex items-center gap-2 min-w-0">
                    {isEarned ? <ArrowDownLeft className="h-3 w-3 text-green-600" /> : <ArrowUpRight className="h-3 w-3 text-amber-600" />}
                    <span className="truncate">{a.booking_id.slice(0, 8)}</span>
                    <Badge variant="outline" className="text-[9px]">{a.origin_type}</Badge>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{a.currency} {Number(a.share_amount).toFixed(2)}</div>
                    <div className="text-[9px] text-muted-foreground">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
