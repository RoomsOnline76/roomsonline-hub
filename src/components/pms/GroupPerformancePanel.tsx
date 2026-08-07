import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UsersRound } from "lucide-react";
import { isRevenueBooking } from "@/lib/revenueStatuses";

interface GroupPerformancePanelProps {
  propertyIds: string[];
  startDate: string;
  endDate: string;
  currency?: string;
}

interface BookingRow {
  id: string;
  total_price: number | null;
  status: string | null;
  payment_status: string | null;
  check_in_date: string | null;
}

interface GroupLine {
  booking_id: string | null;
  group_id: string;
  group: { id: string; name: string; group_type: string | null; status: string | null } | null;
}

const money = (v: number, currency = "ZAR") =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency, maximumFractionDigits: 0 }).format(v || 0);

/**
 * Splits realised revenue between group business and transient business so
 * revenue managers can see how much of the base is contracted.
 */
export function GroupPerformancePanel({ propertyIds, startDate, endDate, currency = "ZAR" }: GroupPerformancePanelProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["pms-group-performance", propertyIds, startDate, endDate],
    enabled: propertyIds.length > 0,
    queryFn: async () => {
      const { data: bookings, error: bErr } = await supabase
        .from("bookings")
        .select("id, total_price, status, payment_status, check_in_date")
        .in("property_id", propertyIds)
        .gte("check_in_date", startDate)
        .lte("check_in_date", endDate);
      if (bErr) throw bErr;

      const { data: lines, error: lErr } = await supabase
        .from("rolos_group_reservations" as never)
        .select("booking_id, group_id, group:rolos_groups!group_id(id, name, group_type, status)")
        .in("group_id", []) // placeholder replaced below
        .limit(0);
      // Fetch group lines by property through the groups table (no property_id on lines).
      const { data: groups, error: gErr } = await supabase
        .from("rolos_groups" as never)
        .select("id, name, group_type, status")
        .in("property_id", propertyIds);
      if (gErr) throw gErr;
      const groupIds = ((groups || []) as unknown as { id: string }[]).map((g) => g.id);

      let groupLines: GroupLine[] = [];
      if (groupIds.length) {
        const { data: gl, error: glErr } = await supabase
          .from("rolos_group_reservations" as never)
          .select("booking_id, group_id, group:rolos_groups!group_id(id, name, group_type, status)")
          .in("group_id", groupIds)
          .not("booking_id", "is", null);
        if (glErr) throw glErr;
        groupLines = (gl || []) as unknown as GroupLine[];
      }
      void lines;
      void lErr;

      return { bookings: (bookings || []) as BookingRow[], groupLines };
    },
  });

  const summary = useMemo(() => {
    const bookings = (data?.bookings || []).filter((b) => isRevenueBooking(b.status, b.payment_status));
    const groupByBooking = new Map<string, GroupLine>();
    for (const line of data?.groupLines || []) {
      if (line.booking_id) groupByBooking.set(line.booking_id, line);
    }

    let groupRevenue = 0;
    let transientRevenue = 0;
    let groupBookings = 0;
    const perGroup = new Map<string, { name: string; type: string; status: string; revenue: number; rooms: number }>();

    for (const b of bookings) {
      const amount = Number(b.total_price || 0);
      const line = groupByBooking.get(b.id);
      if (line) {
        groupRevenue += amount;
        groupBookings += 1;
        const key = line.group_id;
        const existing = perGroup.get(key) ?? {
          name: line.group?.name ?? "Group",
          type: line.group?.group_type ?? "—",
          status: line.group?.status ?? "—",
          revenue: 0,
          rooms: 0,
        };
        existing.revenue += amount;
        existing.rooms += 1;
        perGroup.set(key, existing);
      } else {
        transientRevenue += amount;
      }
    }

    const total = groupRevenue + transientRevenue;
    return {
      groupRevenue,
      transientRevenue,
      total,
      groupShare: total > 0 ? (groupRevenue / total) * 100 : 0,
      groupBookings,
      transientBookings: bookings.length - groupBookings,
      rows: [...perGroup.values()].sort((a, b) => b.revenue - a.revenue),
    };
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Group revenue</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{money(summary.groupRevenue, currency)}</p>
            <p className="text-xs text-muted-foreground">{summary.groupBookings} reservation(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Transient revenue</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{money(summary.transientRevenue, currency)}</p>
            <p className="text-xs text-muted-foreground">{summary.transientBookings} reservation(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Group share of base</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{summary.groupShare.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">of {money(summary.total, currency)} realised</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><UsersRound className="h-4 w-4" /> Group contribution</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading group performance…</p>
          ) : summary.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No group reservations in this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Group</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Rooms</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.rows.map((r) => (
                  <TableRow key={r.name + r.revenue}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-xs capitalize">{r.type}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] capitalize">{r.status}</Badge></TableCell>
                    <TableCell className="text-right">{r.rooms}</TableCell>
                    <TableCell className="text-right">{money(r.revenue, currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
