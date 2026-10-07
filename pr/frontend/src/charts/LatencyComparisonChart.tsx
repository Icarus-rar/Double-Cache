import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';
import { ComparisonRow, STRATEGY_COLORS } from '@/types';

interface LatencyComparisonChartProps {
  data: ComparisonRow[];
  height?: number;
}

export function LatencyComparisonChart({ data, height = 220 }: LatencyComparisonChartProps) {
  const chartData = [
    { percentile: 'Avg', ...buildEntries(data, 'avgLatencyMs') },
    { percentile: 'P50', ...buildEntries(data, 'p50LatencyMs') },
    { percentile: 'P95', ...buildEntries(data, 'p95LatencyMs') },
    { percentile: 'P99', ...buildEntries(data, 'p99LatencyMs') },
  ];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 12, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 16% 18%)" vertical={false} />
        <XAxis
          dataKey="percentile"
          tick={{ fill: 'hsl(215 14% 65%)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
          tickLine={false}
          axisLine={{ stroke: 'hsl(222 16% 16%)' }}
        />
        <YAxis
          tick={{ fill: 'hsl(215 14% 55%)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v.toFixed(1)}ms`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(222 22% 8%)',
            border: '1px solid hsl(222 16% 18%)',
            borderRadius: '6px',
            fontSize: '11px',
            fontFamily: 'JetBrains Mono',
          }}
          labelStyle={{ color: 'hsl(215 14% 65%)' }}
          formatter={(value: number, name: string) => [`${value.toFixed(2)} ms`, name]}
        />
        <Legend
          wrapperStyle={{ fontSize: '10px', fontFamily: 'JetBrains Mono' }}
        />
        {data.map((row) => (
          <Line
            key={row.strategy}
            type="monotone"
            dataKey={row.strategy}
            stroke={STRATEGY_COLORS[row.strategy]}
            strokeWidth={2}
            dot={{ r: 3, fill: STRATEGY_COLORS[row.strategy] }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function buildEntries(data: ComparisonRow[], field: 'avgLatencyMs' | 'p50LatencyMs' | 'p95LatencyMs' | 'p99LatencyMs') {
  const obj: Record<string, number> = {};
  for (const row of data) {
    obj[row.strategy] = row[field];
  }
  return obj;
}
