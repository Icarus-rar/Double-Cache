import { CacheBlock } from '@/types';
import { CacheContainer } from './CacheContainer';
import { DuplicationConnector } from './DuplicationConnector';
import { Database, HardDrive, AlertTriangle } from 'lucide-react';

interface CacheVisualizationProps {
  dbBlocks: CacheBlock[];
  osBlocks: CacheBlock[];
  dbCacheSize: number;
  osCacheSize: number;
  duplicatedBlockIds: number[];
  currentBlockId: number;
}

export function CacheVisualization({
  dbBlocks,
  osBlocks,
  dbCacheSize,
  osCacheSize,
  duplicatedBlockIds,
  currentBlockId,
}: CacheVisualizationProps) {
  const dbBlockIds = dbBlocks.map((b) => b.blockId);
  const osBlockIds = osBlocks.map((b) => b.blockId);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm border border-teal-500/50 bg-teal-950/60" />
          <span>DB Buffer Pool</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm border border-amber-500/50 bg-amber-950/60" />
          <span>OS Page Cache</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 animate-pulse-glow rounded-sm border border-red-500/70 bg-red-950/50" />
          <span className="text-red-400/80">Duplicated Block</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3 text-red-400" />
          <span className="font-mono tabular-nums text-red-400">
            {duplicatedBlockIds.length} duplicate{duplicatedBlockIds.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="relative grid grid-cols-1 gap-3 lg:grid-cols-2">
        <CacheContainer
          title="DB Buffer Pool"
          cacheType="db"
          blocks={dbBlocks}
          maxSize={dbCacheSize}
          currentBlockId={currentBlockId}
          accentColor="#2dd4bf"
        />
        <CacheContainer
          title="OS Page Cache"
          cacheType="os"
          blocks={osBlocks}
          maxSize={osCacheSize}
          currentBlockId={currentBlockId}
          accentColor="#fbbf24"
        />
        <DuplicationConnector
          duplicatedBlockIds={duplicatedBlockIds}
          dbBlocks={dbBlockIds}
          osBlocks={osBlockIds}
        />
      </div>

      <div className="flex items-center justify-center gap-6 rounded-lg border border-border/40 bg-muted/20 px-4 py-2">
        <div className="flex items-center gap-2">
          <Database className="h-3.5 w-3.5 text-teal-400" />
          <span className="font-mono text-xs text-muted-foreground">
            DB: <span className="text-teal-400 tabular-nums">{dbBlocks.length}</span> blocks
          </span>
        </div>
        <div className="h-3 w-px bg-border/60" />
        <div className="flex items-center gap-2">
          <HardDrive className="h-3.5 w-3.5 text-amber-400" />
          <span className="font-mono text-xs text-muted-foreground">
            OS: <span className="text-amber-400 tabular-nums">{osBlocks.length}</span> blocks
          </span>
        </div>
        <div className="h-3 w-px bg-border/60" />
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
          <span className="font-mono text-xs text-muted-foreground">
            Duplicated: <span className="text-red-400 tabular-nums">{duplicatedBlockIds.length}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
