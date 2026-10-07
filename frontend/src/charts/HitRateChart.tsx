import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';
import { SimulationHistoryPoint } from '@/types';

interface HitRateChartProps {
  data: SimulationHistoryPoint[];
  height?: number;
}

export function HitRateChart({ data, height = 180 }: HitRateChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="dbHitGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="osHitGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.02} />
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
          tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
          domain={[0, 1]}
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
          formatter={(value: number, name: string) => {
            const label = name === 'dbHitRate' ? 'DB Hit Rate' : 'OS Hit Rate';
            return [`${(value * 100).toFixed(1)}%`, label];
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: '10px', fontFamily: 'JetBrains Mono' }}
          formatter={(value) => (
            <span style={{ color: value === 'dbHitRate' ? '#2dd4bf' : '#fbbf24' }}>
              {value === 'dbHitRate' ? 'DB Hit Rate' : 'OS Hit Rate'}
            </span>
          )}
        />
        <Area
          type="monotone"
          dataKey="dbHitRate"
          stroke="#2dd4bf"
          strokeWidth={1.5}
          fill="url(#dbHitGradient)"
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="osHitRate"
          stroke="#fbbf24"
          strokeWidth={1.5}
          fill="url(#osHitGradient)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
