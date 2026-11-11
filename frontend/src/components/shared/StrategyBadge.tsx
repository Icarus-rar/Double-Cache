import { Strategy, STRATEGY_COLORS } from '@/types';
import { cn } from '@/lib/utils';

interface StrategyBadgeProps {
  strategy: Strategy;
  showDot?: boolean;
  size?: 'sm' | 'md';
}

export function StrategyBadge({ strategy, showDot = true, size = 'md' }: StrategyBadgeProps) {
  const color = STRATEGY_COLORS[strategy];
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border bg-muted/20 font-medium',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'
      )}
      style={{ borderColor: `${color}40` }}
    >
      {showDot && (
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}80` }}
        />
      )}
      <span style={{ color }}>{strategy}</span>
    </div>
  );
}
