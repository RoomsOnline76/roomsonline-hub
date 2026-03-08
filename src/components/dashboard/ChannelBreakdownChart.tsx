import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface ChannelData {
  channel: string;
  gbv: number;
  commission: number;
  count: number;
}

interface ChannelBreakdownChartProps {
  data: ChannelData[];
  isLoading?: boolean;
}

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(217, 91%, 60%)",
  "hsl(280, 65%, 60%)",
  "hsl(340, 75%, 55%)",
];

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const formatChannelName = (channel: string) => {
  const channelMap: Record<string, string> = {
    nightsbridge: "NightsBridge",
    hostfully: "Hostfully",
    benson: "Benson",
    direct: "Direct Link",
    Direct: "Direct Link",
    widget: "Widget",
    booking_bar: "Booking Bar",
    full_embed: "Full Embed",
    wordpress: "WordPress",
    api: "API",
  };
  return channelMap[channel.toLowerCase()] || channel;
};

export function ChannelBreakdownChart({ data, isLoading }: ChannelBreakdownChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Revenue by Channel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center">
            <Skeleton className="h-32 w-32 rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalCommission = data.reduce((sum, d) => sum + d.commission, 0);

  const chartData = data
    .map((d) => ({
      name: formatChannelName(d.channel),
      value: d.commission,
      percentage: totalCommission > 0 ? (d.commission / totalCommission) * 100 : 0,
      count: d.count,
    }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Revenue by Channel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
            No channel data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Revenue by Channel</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{
                  backgroundColor: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Legend
                formatter={(value) => (
                  <span className="text-xs text-foreground">{value}</span>
                )}
                wrapperStyle={{ fontSize: "12px" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
