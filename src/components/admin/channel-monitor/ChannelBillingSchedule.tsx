import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatEur, formatZar, type ForecastResult } from "@/lib/channelBillingForecast";
import type { FxRate } from "@/hooks/useChannelCostMonitor";
import { cn } from "@/lib/utils";

interface Props {
  schedule: ForecastResult[];
  currentMonth: string;
  fx: FxRate | null;
}

export function ChannelBillingSchedule({ schedule, currentMonth, fx }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">
          Commitment schedule
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            projected at today&apos;s listing count
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Minimum</TableHead>
              <TableHead className="text-right">Usage</TableHead>
              <TableHead className="text-right">Billed (EUR)</TableHead>
              <TableHead className="text-right">Billed (ZAR)</TableHead>
              <TableHead>Driver</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedule.map((row) => (
              <TableRow key={row.month} className={cn(row.month === currentMonth && "bg-muted/60")}>
                <TableCell className="font-medium">
                  {row.monthLabel}
                  {row.month === currentMonth && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-primary">current</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatEur(row.minimumEur)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatEur(row.usageEur)}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatEur(row.billableEur)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {fx ? formatZar(row.billableEur * fx.eurToZar) : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={row.driver === "usage" ? "default" : "secondary"} className="text-[10px]">
                    {row.driver === "grace" ? "Grace" : row.driver === "minimum" ? "Minimum" : "Usage"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
