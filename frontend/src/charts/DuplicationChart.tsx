import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SimulationHistoryPoint } from '@/types';

interface DuplicationChartProps {
  data: SimulationHistoryPoint[];
  height?: number;
}

export function DuplicationChart({ data, height = 180 }: DuplicationChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="dupGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 16% 18%)" vertical={false} />
        <XAxis
          dataKey="step"
          tick={{ fill: 'hsl(215 14% 55%)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
          tickLine={false}
          axisLine={{ stroke: 'hsl(222 16% 16%)' }}
        />
        <YAxis
          tick={{ fill: 'hsl(215 14% 55%)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v.toFixed(0)}%`}
          domain={[0, 100]}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(222 22% 8%)',
            border: '1px solid hsl(222 16% 18%)',
            borderRadius: '6px',
            fontSize: '11px',
            fontFamily: 'JetBrains Mono',
          }}
          labelStyle={{ color: 'hsl(215 14% 55%)' }}
          formatter={(value: number) => [`${value.toFixed(1)}%`, 'Duplication']}
        />
        <Area
          type="monotone"
          dataKey="duplicationPercent"
          stroke="#ef4444"
          strokeWidth={1.5}
          fill="url(#dupGradient)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
