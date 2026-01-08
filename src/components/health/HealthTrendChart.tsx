import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

interface DataPoint {
  time: string;
  latency: number;
  status: string;
}

interface HealthTrendChartProps {
  data: DataPoint[];
  expectedLatency?: number;
  height?: number;
}

export function HealthTrendChart({ data, expectedLatency = 5000, height = 120 }: HealthTrendChartProps) {
  const chartData = useMemo(() => {
    return data.map((point, index) => ({
      ...point,
      index,
      displayTime: point.time,
    }));
  }, [data]);

  if (data.length === 0) {
    return (
      <div 
        className="flex items-center justify-center text-muted-foreground text-sm bg-muted/50 rounded"
        style={{ height }}
      >
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
        <XAxis 
          dataKey="displayTime" 
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis 
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={(value) => `${value}ms`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
            fontSize: '12px',
          }}
          formatter={(value: number, name: string) => [
            `${value}ms`,
            name === 'latency' ? 'Latency' : name
          ]}
          labelFormatter={(label) => `Time: ${label}`}
        />
        <ReferenceLine 
          y={expectedLatency} 
          stroke="hsl(var(--destructive))" 
          strokeDasharray="3 3" 
          strokeOpacity={0.5}
        />
        <Line
          type="monotone"
          dataKey="latency"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: 'hsl(var(--primary))' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
