import {
  CacheBlock,
  HitType,
  SimulationConfig,
  SimulationHistoryPoint,
  SimulationState,
  SimulationStatus,
  Strategy,
  WorkloadType,
} from '@/types';

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: number) {
  return mulberry32(seed);
}

export type Rng = ReturnType<typeof createRng>;

function pickBlock(rng: Rng, workload: WorkloadType, maxBlock: number, step: number): number {
  switch (workload) {
    case WorkloadType.SEQUENTIAL:
      return step % maxBlock;
    case WorkloadType.RANDOM:
      return Math.floor(rng() * maxBlock);
    case WorkloadType.HOT_SPOT: {
      const hot = Math.floor(rng() * 8);
      return rng() < 0.7 ? hot : Math.floor(rng() * maxBlock);
    }
    case WorkloadType.NETFLIX: {
      const bucket = Math.floor(step / 50) % 10;
      return rng() < 0.6 ? bucket * 10 + Math.floor(rng() * 5) : Math.floor(rng() * maxBlock);
    }
    case WorkloadType.FLASH_SALE: {
      const spike = Math.floor(step / 100) % 4;
      return rng() < 0.85 ? spike * 3 : Math.floor(rng() * maxBlock);
    }
    case WorkloadType.MULTI_TENANT: {
      const tenant = step % 5;
      return tenant * 20 + Math.floor(rng() * 15);
    }
    case WorkloadType.STARTUP_BUDGET:
      return rng() < 0.8 ? Math.floor(rng() * 12) : Math.floor(rng() * maxBlock);
    default:
      return Math.floor(rng() * maxBlock);
  }
}

function lruUpdate(cache: number[], blockId: number, maxSize: number): number[] {
  const filtered = cache.filter((b) => b !== blockId);
  filtered.push(blockId);
  if (filtered.length > maxSize) filtered.shift();
  return filtered;
}

function latencyFor(hitType: HitType, strategy: Strategy): number {
  switch (hitType) {
    case HitType.DB_HIT:
      return 0.05 + Math.random() * 0.1;
    case HitType.OS_HIT:
      return strategy === Strategy.DIRECT_IO ? 0.4 + Math.random() * 0.2 : 0.15 + Math.random() * 0.15;
    case HitType.DISK_READ:
      return 2.5 + Math.random() * 3.5;
  }
}

function determineHit(
  blockId: number,
  dbCache: number[],
  osCache: number[],
  strategy: Strategy,
  rng: Rng,
): HitType {
  const inDb = dbCache.includes(blockId);
  const inOs = osCache.includes(blockId);

  if (inDb) return HitType.DB_HIT;

  if (strategy === Strategy.DOUBLE_CACHING) {
    if (inOs) return HitType.OS_HIT;
    return HitType.DISK_READ;
  }

  if (strategy === Strategy.COORDINATED) {
    if (inOs && rng() < 0.3) return HitType.OS_HIT;
    return HitType.DISK_READ;
  }

  if (strategy === Strategy.DIRECT_IO) {
    return HitType.DISK_READ;
  }

  if (strategy === Strategy.ADAPTIVE) {
    if (inOs && rng() < 0.15) return HitType.OS_HIT;
    return HitType.DISK_READ;
  }

  return HitType.DISK_READ;
}

function updateOsCache(
  osCache: number[],
  blockId: number,
  hitType: HitType,
  strategy: Strategy,
  maxSize: number,
  rng: Rng,
): number[] {
  if (strategy === Strategy.DIRECT_IO) {
    return osCache;
  }
  if (hitType === HitType.DISK_READ) {
    if (strategy === Strategy.DOUBLE_CACHING) {
      return lruUpdate(osCache, blockId, maxSize);
    }
    if (strategy === Strategy.COORDINATED && rng() < 0.3) {
      return lruUpdate(osCache, blockId, maxSize);
    }
    if (strategy === Strategy.ADAPTIVE && rng() < 0.15) {
      return lruUpdate(osCache, blockId, maxSize);
    }
  }
  return osCache;
}

function computeDuplicatedBlocks(dbCache: number[], osCache: number[]): number[] {
  const osSet = new Set(osCache);
  return dbCache.filter((b) => osSet.has(b));
}

function blocksToCacheBlocks(blockIds: number[], duplicatedIds: number[], lastAccessed: number): CacheBlock[] {
  const dupSet = new Set(duplicatedIds);
  return blockIds.map((id) => ({
    blockId: id,
    isDuplicated: dupSet.has(id),
    recentlyAccessed: id === lastAccessed,
    accessCount: 1,
  }));
}

const MAX_BLOCK_ID = 100;

export interface SimulationRuntime {
  rng: Rng;
  dbCache: number[];
  osCache: number[];
  dbCacheHits: number;
  osCacheHits: number;
  diskReads: number;
  dbCacheMisses: number;
  osCacheMisses: number;
  history: SimulationHistoryPoint[];
}

export function createRuntime(config: SimulationConfig): SimulationRuntime {
  return {
    rng: createRng(Date.now() % 100000),
    dbCache: [],
    osCache: [],
    dbCacheHits: 0,
    osCacheHits: 0,
    diskReads: 0,
    dbCacheMisses: 0,
    osCacheMisses: 0,
    history: [],
  };
}

export function stepSimulation(
  config: SimulationConfig,
  runtime: SimulationRuntime,
  currentStep: number,
): { state: SimulationState; hitType: HitType; blockId: number; latencyMs: number } {
  const { rng, dbCache: prevDb, osCache: prevOs } = runtime;
  const blockId = pickBlock(rng, config.workload, MAX_BLOCK_ID, currentStep);

  const hitType = determineHit(blockId, prevDb, prevOs, config.strategy, rng);
  const latencyMs = latencyFor(hitType, config.strategy);

  let newDb = prevDb;
  let newOs = prevOs;

  if (hitType === HitType.DB_HIT) {
    runtime.dbCacheHits++;
    newDb = lruUpdate(prevDb, blockId, config.dbCacheSize);
  } else if (hitType === HitType.OS_HIT) {
    runtime.osCacheHits++;
    newDb = lruUpdate(prevDb, blockId, config.dbCacheSize);
    runtime.dbCacheMisses++;
  } else {
    runtime.diskReads++;
    runtime.dbCacheMisses++;
    runtime.osCacheMisses++;
    newDb = lruUpdate(prevDb, blockId, config.dbCacheSize);
    newOs = updateOsCache(prevOs, blockId, hitType, config.strategy, config.osCacheSize, rng);
  }

  runtime.dbCache = newDb;
  runtime.osCache = newOs;

  const duplicatedIds = computeDuplicatedBlocks(newDb, newOs);
  const totalCacheBlocks = newDb.length + newOs.length;
  const duplicationPercent =
    totalCacheBlocks > 0 ? (duplicatedIds.length / totalCacheBlocks) * 100 : 0;

  const dbHitRate = currentStep > 0 ? runtime.dbCacheHits / currentStep : 0;
  const osHitRate = currentStep > 0 ? runtime.osCacheHits / currentStep : 0;

  const blockSizeMb = 0.016;
  const memoryWasteMb = duplicatedIds.length * blockSizeMb;

  const historyPoint: SimulationHistoryPoint = {
    step: currentStep,
    duplicationPercent,
    latencyMs,
    dbHitRate,
    osHitRate,
    diskReads: runtime.diskReads,
  };
  runtime.history.push(historyPoint);
  if (runtime.history.length > 200) runtime.history.shift();

  const dbCacheBlocks = blocksToCacheBlocks(newDb, duplicatedIds, blockId);
  const osCacheBlocks = blocksToCacheBlocks(newOs, duplicatedIds, blockId);

  const state: SimulationState = {
    config,
    status: currentStep >= config.totalSteps ? SimulationStatus.COMPLETE : SimulationStatus.RUNNING,
    metrics: {
      step: currentStep,
      totalSteps: config.totalSteps,
      blockId,
      hitType,
      latencyMs,
      dbCacheHits: runtime.dbCacheHits,
      osCacheHits: runtime.osCacheHits,
      diskReads: runtime.diskReads,
      dbCacheMisses: runtime.dbCacheMisses,
      osCacheMisses: runtime.osCacheMisses,
      duplicatedBlocks: duplicatedIds.length,
      duplicationPercent,
      dbHitRate,
      osHitRate,
      memoryWasteMb,
    },
    dbCache: dbCacheBlocks,
    osCache: osCacheBlocks,
    duplicatedBlockIds: duplicatedIds,
    history: [...runtime.history],
  };

  return { state, hitType, blockId, latencyMs };
}

export function createInitialState(config: SimulationConfig): SimulationState {
  return {
    config,
    status: SimulationStatus.READY,
    metrics: {
      step: 0,
      totalSteps: config.totalSteps,
      blockId: 0,
      hitType: HitType.DISK_READ,
      latencyMs: 0,
      dbCacheHits: 0,
      osCacheHits: 0,
      diskReads: 0,
      dbCacheMisses: 0,
      osCacheMisses: 0,
      duplicatedBlocks: 0,
      duplicationPercent: 0,
      dbHitRate: 0,
      osHitRate: 0,
      memoryWasteMb: 0,
    },
    dbCache: [],
    osCache: [],
    duplicatedBlockIds: [],
    history: [],
  };
}
