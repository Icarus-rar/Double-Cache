import { SimulationStatus } from '@/types';
import { cn } from '@/lib/utils';

interface StatusIndicatorProps {
  status: SimulationStatus;
}

const config = {
  [SimulationStatus.READY]: {
    label: 'Ready',
    dotClass: 'bg-slate-400',
    textClass: 'text-slate-400',
    pulse: false,
  },
  [SimulationStatus.RUNNING]: {
    label: 'Running',
    dotClass: 'bg-green-500',
    textClass: 'text-green-400',
    pulse: true,
  },
  [SimulationStatus.PAUSED]: {
    label: 'Paused',
    dotClass: 'bg-amber-500',
    textClass: 'text-amber-400',
    pulse: false,
  },
  [SimulationStatus.COMPLETE]: {
    label: 'Complete',
    dotClass: 'bg-teal-500',
    textClass: 'text-teal-400',
    pulse: false,
  },
};

export function StatusIndicator({ status }: StatusIndicatorProps) {
  const { label, dotClass, textClass, pulse } = config[status];
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1">
      <span className={cn('h-2 w-2 rounded-full', dotClass, pulse && 'animate-pulse shadow-[0_0_8px_currentColor]')} />
      <span className={cn('font-mono text-xs font-semibold uppercase tracking-wider', textClass)}>
        {label}
      </span>
    </div>
  );
}
