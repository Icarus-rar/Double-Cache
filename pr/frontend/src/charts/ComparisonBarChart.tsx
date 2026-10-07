import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ComparisonRow, Strategy, STRATEGY_COLORS } from '@/types';

interface ComparisonBarChartProps {
  data: ComparisonRow[];
  metric: 'duplicationPercent' | 'memoryWasteMb' | 'diskReads' | 'avgLatencyMs';
  label: string;
  unit?: string;
  height?: number;
  lowerIsBetter?: boolean;
}

export function ComparisonBarChart({
  data,
  metric,
  label,
  unit = '',
  height = 200,
  lowerIsBetter = true,
}: ComparisonBarChartProps) {
  const sorted = [...data].sort((a, b) => {
    const val = lowerIsBetter ? a[metric] - b[metric] : b[metric] - a[metric];
    return val;
  });
  const bestStrategy = sorted[0]?.strategy;
  const chartData = data.map((row) => ({
    strategy: row.strategy,
    value: row[metric],
    color: STRATEGY_COLORS[row.strategy],
    isBest: row.strategy === bestStrategy,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 12, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 16% 18%)" vertical={false} />
        <XAxis
          dataKey="strategy"
          tick={{ fill: 'hsl(215 14% 65%)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
          tickLine={false}
          axisLine={{ stroke: 'hsl(222 16% 16%)' }}
          interval={0}
          angle={-12}
          textAnchor="end"
          height={50}
        />
        <YAxis
          tick={{ fill: 'hsl(215 14% 55%)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v.toFixed(0)}${unit}`}
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
          formatter={(value: number) => [`${value.toFixed(2)}${unit}`, label]}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={48}>
          {chartData.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={entry.color}
              fillOpacity={entry.isBest ? 1 : 0.6}
              stroke={entry.isBest ? entry.color : 'none'}
              strokeWidth={entry.isBest ? 2 : 0}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
