import { CacheBlock } from '@/types';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CacheTileProps {
  block: CacheBlock;
  cacheType: 'db' | 'os';
  isCurrent: boolean;
}

export function CacheTile({ block, cacheType, isCurrent }: CacheTileProps) {
  const baseColor =
    cacheType === 'db'
      ? 'border-teal-500/30 bg-teal-950/40 text-teal-300'
      : 'border-amber-500/30 bg-amber-950/40 text-amber-300';

  const activeColor =
    cacheType === 'db'
      ? 'border-teal-400 bg-teal-900/60 text-teal-200 glow-db'
      : 'border-amber-400 bg-amber-900/60 text-amber-200 glow-os';

  return (
    <div
      className={cn(
        'relative flex items-center justify-center rounded-md border px-1 py-1.5 font-mono text-xs font-semibold transition-all duration-300',
        block.recentlyAccessed && isCurrent ? activeColor : baseColor,
        block.isDuplicated && 'animate-pulse-glow border-red-500/70 bg-red-950/50 text-red-300',
        'animate-tile-enter'
      )}
    >
      <span className="tabular-nums">{block.blockId}</span>
      {block.isDuplicated && (
        <AlertTriangle className="absolute -right-1 -top-1 h-3 w-3 text-red-400 drop-shadow-[0_0_4px_rgba(239,68,68,0.8)]" />
      )}
    </div>
  );
}
