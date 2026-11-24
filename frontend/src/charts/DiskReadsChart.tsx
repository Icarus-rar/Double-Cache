import {
  Area,
  AreaChart,
  CartesianGrid,
  Label,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SimulationHistoryPoint } from '@/types';

interface DiskReadsChartProps {
  data: SimulationHistoryPoint[];
  height?: number;
}

export function DiskReadsChart({ data, height = 180 }: DiskReadsChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 16 }}>
        <defs>
          <linearGradient id="diskGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#94a3b8" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 16% 18%)" vertical={false} />
        <XAxis
          dataKey="step"
          tick={{ fill: 'hsl(215 14% 55%)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
          tickLine={false}
          axisLine={{ stroke: 'hsl(222 16% 16%)' }}
        >
          <Label value="Simulation Step" position="insideBottom" offset={-10} fill="hsl(215 14% 55%)" fontSize={10} />
        </XAxis>
        <YAxis
          tick={{ fill: 'hsl(215 14% 55%)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        >
          <Label value="Disk I/Os" angle={-90} position="insideLeft" offset={6} fill="hsl(215 14% 55%)" fontSize={10} />
        </YAxis>
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(222 22% 8%)',
            border: '1px solid hsl(222 16% 18%)',
            borderRadius: '6px',
            fontSize: '11px',
            fontFamily: 'JetBrains Mono',
          }}
          labelStyle={{ color: 'hsl(215 14% 55%)' }}
          formatter={(value: number) => [`${value}`, 'Disk Reads']}
        />
        <Area
          type="monotone"
          dataKey="diskReads"
          stroke="#94a3b8"
          strokeWidth={1.5}
          fill="url(#diskGradient)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}