import {
  Line,
  LineChart,
  CartesianGrid,
  Label,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SimulationHistoryPoint } from '@/types';

interface LatencyChartProps {
  data: SimulationHistoryPoint[];
  height?: number;
}

export function LatencyChart({ data, height = 180 }: LatencyChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 16 }}>
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
          tickFormatter={(v) => `${v.toFixed(1)}`}
        >
          <Label value="Latency (ms)" angle={-90} position="insideLeft" offset={6} fill="hsl(215 14% 55%)" fontSize={10} />
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
          formatter={(value: number) => [`${value.toFixed(2)} ms`, 'Latency']}
        />
        <Line
          type="monotone"
          dataKey="latencyMs"
          stroke="#2dd4bf"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}