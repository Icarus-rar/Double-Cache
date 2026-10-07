import { cn } from '@/lib/utils';

interface MetricStatProps {
  label: string;
  value: string | number;
  unit?: string;
  color?: 'default' | 'db' | 'os' | 'dup' | 'ok' | 'muted';
  icon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const colorMap = {
  default: 'text-foreground',
  db: 'text-teal-400',
  os: 'text-amber-400',
  dup: 'text-red-400',
  ok: 'text-green-400',
  muted: 'text-muted-foreground',
};

export function MetricStat({
  label,
  value,
  unit,
  color = 'default',
  icon,
  size = 'md',
}: MetricStatProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className={cn('font-mono font-semibold tabular-nums', colorMap[color], size === 'lg' ? 'text-lg' : size === 'sm' ? 'text-xs' : 'text-sm')}>
        {value}
        {unit && <span className="ml-0.5 text-xs font-normal text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}
