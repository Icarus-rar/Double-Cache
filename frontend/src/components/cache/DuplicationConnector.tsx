import { useMemo } from 'react';

interface DuplicationConnectorProps {
  duplicatedBlockIds: number[];
  dbBlocks: number[];
  osBlocks: number[];
}

export function DuplicationConnector({
  duplicatedBlockIds,
  dbBlocks,
  osBlocks,
}: DuplicationConnectorProps) {
  const connections = useMemo(() => {
    return duplicatedBlockIds
      .map((blockId) => {
        const dbIndex = dbBlocks.indexOf(blockId);
        const osIndex = osBlocks.indexOf(blockId);
        if (dbIndex === -1 || osIndex === -1) return null;
        return { blockId, dbIndex, osIndex };
      })
      .filter((c): c is { blockId: number; dbIndex: number; osIndex: number } => c !== null);
  }, [duplicatedBlockIds, dbBlocks, osBlocks]);

  if (connections.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-1 px-2">
        {connections.length > 0 && (
          <div className="flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-950/30 px-2.5 py-1 backdrop-blur-sm">
            <div className="h-2 w-2 animate-pulse rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
            <span className="font-mono text-[10px] font-semibold text-red-400">
              {connections.length} DUP{connections.length > 1 ? 'S' : ''}
            </span>
          </div>
        )}
        {connections.slice(0, 6).map((c) => (
          <div
            key={c.blockId}
            className="flex items-center gap-1 font-mono text-[9px] text-red-400/70"
          >
            <span className="tabular-nums">#{c.blockId}</span>
            <div className="h-px w-3 bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />
          </div>
        ))}
        {connections.length > 6 && (
          <span className="font-mono text-[9px] text-red-400/50">
            +{connections.length - 6} more
          </span>
        )}
      </div>
    </div>
  );
}
