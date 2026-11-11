import { CacheBlock } from '@/types';
import { Database, HardDrive } from 'lucide-react';
import { CacheTile } from './CacheTile';
import { cn } from '@/lib/utils';

interface CacheContainerProps {
  title: string;
  cacheType: 'db' | 'os';
  blocks: CacheBlock[];
  maxSize: number;
  currentBlockId: number;
  accentColor: string;
}

export function CacheContainer({
  title,
  cacheType,
  blocks,
  maxSize,
  currentBlockId,
  accentColor,
}: CacheContainerProps) {
  const filled = blocks.length;
  const utilization = maxSize > 0 ? (filled / maxSize) * 100 : 0;
  const emptySlots = maxSize - filled;

  const Icon = cacheType === 'db' ? Database : HardDrive;

  const gridCols =
    maxSize <= 4
      ? 'grid-cols-4'
      : maxSize <= 8
        ? 'grid-cols-4'
        : maxSize <= 16
          ? 'grid-cols-4 sm:grid-cols-8'
          : 'grid-cols-4 sm:grid-cols-8';

  return (
    <div
      className={cn(
        'glass-card rounded-lg p-4 transition-all duration-300',
        cacheType === 'db' ? 'hover:border-teal-500/30' : 'hover:border-amber-500/30'
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" style={{ color: accentColor }} />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/90">
            {title}
          </h3>
        </div>
        <div className="font-mono text-xs tabular-nums text-muted-foreground">
          {filled}
          <span className="text-muted-foreground/50"> / {maxSize}</span>
        </div>
      </div>

      <div className={cn('grid gap-1.5', gridCols)}>
        {blocks.map((block) => (
          <CacheTile
            key={`${cacheType}-${block.blockId}`}
            block={block}
            cacheType={cacheType}
            isCurrent={block.blockId === currentBlockId}
          />
        ))}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <div
            key={`empty-${cacheType}-${i}`}
            className="flex items-center justify-center rounded-md border border-dashed border-border/40 px-1 py-1.5 font-mono text-xs text-muted-foreground/20"
          >
            —
          </div>
        ))}
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Utilization</span>
          <span className="font-mono tabular-nums">{utilization.toFixed(0)}%</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted/50">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${utilization}%`,
              backgroundColor: accentColor,
              boxShadow: `0 0 8px ${accentColor}80`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
