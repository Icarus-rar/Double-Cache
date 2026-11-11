import { cn } from '@/lib/utils';

interface TimelineProps {
  currentStep: number;
  totalSteps: number;
  status: string;
}

export function Timeline({ currentStep, totalSteps, status }: TimelineProps) {
  const progress = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;
  const segments = 40;
  const filledSegments = Math.floor((progress / 100) * segments);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/40 bg-muted/20 px-4 py-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-mono uppercase tracking-wider text-muted-foreground">
          Simulation Timeline
        </span>
        <span className="font-mono tabular-nums text-foreground/80">
          Step <span className="text-foreground">{currentStep.toLocaleString()}</span> / {totalSteps.toLocaleString()}
        </span>
      </div>

      <div className="relative flex gap-0.5">
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-sm transition-all duration-300',
              i < filledSegments
                ? status === 'Complete'
                  ? 'bg-teal-500/80'
                  : 'bg-teal-500/60'
                : 'bg-muted/60'
            )}
            style={
              i < filledSegments
                ? { boxShadow: '0 0 4px rgba(45,212,191,0.4)' }
                : undefined
            }
          />
        ))}
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="font-mono">0</span>
        <span className="font-mono tabular-nums">{progress.toFixed(1)}%</span>
        <span className="font-mono">{totalSteps.toLocaleString()}</span>
      </div>
    </div>
  );
}
