
import {
  HitType,
  type CacheBlock,
  type SimulationHistoryPoint,
  type SimulationMetrics,
} from '@/types';

import type {
  SimulationHistoryItem,
  SimulationResponse,
} from './simulationApi';

export interface AdaptedSimulationStep {
  metrics: SimulationMetrics;
  dbCache: CacheBlock[];
  osCache: CacheBlock[];
  duplicatedBlockIds: number[];
  historyPoint: SimulationHistoryPoint;
}

export function adaptSimulationHistory(
  response: SimulationResponse,
): AdaptedSimulationStep[] {
  let dbCacheHits = 0;
  let osCacheHits = 0;
  let diskReads = 0;
  const accessCounts = new Map<number, number>();

  return response.history.map((item: SimulationHistoryItem, index) => {
    if (item.hit_type === 'db_hit') dbCacheHits++;
    if (item.hit_type === 'os_hit') osCacheHits++;
    if (item.hit_type === 'disk_read') diskReads++;

    accessCounts.set(
      item.block_id,
      (accessCounts.get(item.block_id) ?? 0) + 1,
    );

    const dbBlocks = item.db_blocks ?? [];
    const osBlocks = item.os_blocks ?? [];
    const duplicatedBlockIds =
      item.duplicated_block_ids ??
      dbBlocks.filter((id) => osBlocks.includes(id));

    const toCacheBlocks = (ids: number[]): CacheBlock[] =>
      ids.map((blockId) => ({
        blockId,
        isDuplicated: duplicatedBlockIds.includes(blockId),
        recentlyAccessed: blockId === item.block_id,
        accessCount: accessCounts.get(blockId) ?? 0,
      }));

    const totalSteps = response.history.length;
    const totalDbAccesses = dbCacheHits + osCacheHits + diskReads;
    const duplicationPercent =
      dbBlocks.length > 0
        ? (duplicatedBlockIds.length / dbBlocks.length) * 100
        : 0;

    const metrics: SimulationMetrics = {
      step: item.step,
      totalSteps,
      blockId: item.block_id,
      hitType:
        item.hit_type === 'db_hit'
          ? HitType.DB_HIT
          : item.hit_type === 'os_hit'
            ? HitType.OS_HIT
            : HitType.DISK_READ,
      latencyMs: item.latency_ms,
      dbCacheHits,
      osCacheHits,
      diskReads,
      dbCacheMisses: totalDbAccesses - dbCacheHits,
      osCacheMisses: diskReads,
      duplicatedBlocks: duplicatedBlockIds.length,
      duplicationPercent,
      dbHitRate: totalDbAccesses > 0 ? dbCacheHits / totalDbAccesses : 0,
      osHitRate: totalDbAccesses > 0 ? osCacheHits / totalDbAccesses : 0,
      memoryWasteMb: (item.memory_wasted_kb ?? duplicatedBlockIds.length * 4) / 1024,
    };

    const historyPoint: SimulationHistoryPoint = {
      step: item.step,
      duplicationPercent,
      latencyMs: item.latency_ms,
      dbHitRate: metrics.dbHitRate,
      osHitRate: metrics.osHitRate,
      diskReads,
    };

    return {
      metrics,
      dbCache: toCacheBlocks(dbBlocks),
      osCache: toCacheBlocks(osBlocks),
      duplicatedBlockIds,
      historyPoint,
    };
  });
}
