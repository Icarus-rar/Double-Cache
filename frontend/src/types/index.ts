export enum HitType {
  DB_HIT = 'DB_HIT',
  OS_HIT = 'OS_HIT',
  DISK_READ = 'DISK_READ',
}

export enum Strategy {
  DOUBLE_CACHING = 'Double Caching',
  COORDINATED = 'Coordinated',
  DIRECT_IO = 'Direct I/O',
  ADAPTIVE = 'Adaptive',
}

export enum WorkloadType {
  SEQUENTIAL = 'Sequential',
  RANDOM = 'Random',
  HOT_SPOT = 'Hot Spot',
  NETFLIX = 'Netflix',
  FLASH_SALE = 'Flash Sale',
  MULTI_TENANT = 'Multi-Tenant',
  STARTUP_BUDGET = 'Startup Budget',
}

export enum SimulationStatus {
  READY = 'Ready',
  RUNNING = 'Running',
  PAUSED = 'Paused',
  COMPLETE = 'Complete',
}

export interface CacheBlock {
  blockId: number;
  isDuplicated: boolean;
  recentlyAccessed: boolean;
  accessCount: number;
}

export interface SimulationConfig {
  workload: WorkloadType;
  strategy: Strategy;
  dbCacheSize: number;
  osCacheSize: number;
  speed: number;
  totalSteps: number;
}

export interface SimulationMetrics {
  step: number;
  totalSteps: number;
  blockId: number;
  hitType: HitType;
  latencyMs: number;
  dbCacheHits: number;
  osCacheHits: number;
  diskReads: number;
  dbCacheMisses: number;
  osCacheMisses: number;
  duplicatedBlocks: number;
  duplicationPercent: number;
  dbHitRate: number;
  osHitRate: number;
  memoryWasteMb: number;
}

export interface SimulationState {
  config: SimulationConfig;
  status: SimulationStatus;
  metrics: SimulationMetrics;
  dbCache: CacheBlock[];
  osCache: CacheBlock[];
  duplicatedBlockIds: number[];
  history: SimulationHistoryPoint[];
}

export interface SimulationHistoryPoint {
  step: number;
  duplicationPercent: number;
  latencyMs: number;
  dbHitRate: number;
  osHitRate: number;
  diskReads: number;
}

export interface RunSummary {
  id: string;
  workload: WorkloadType;
  strategy: Strategy;
  date: string;
  totalSteps: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  dbHitRate: number;
  osHitRate: number;
  diskReads: number;
  duplicationPercent: number;
  memoryWasteMb: number;
  history: SimulationHistoryPoint[];
}

export interface ComparisonRow {
  strategy: Strategy;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  dbHitRate: number;
  osHitRate: number;
  diskReads: number;
  duplicationPercent: number;
  memoryWasteMb: number;
}

export const STRATEGY_COLORS: Record<Strategy, string> = {
  [Strategy.DOUBLE_CACHING]: '#ef4444',
  [Strategy.COORDINATED]: '#14b8a6',
  [Strategy.DIRECT_IO]: '#f59e0b',
  [Strategy.ADAPTIVE]: '#22c55e',
};

export const HIT_TYPE_COLORS: Record<HitType, string> = {
  [HitType.DB_HIT]: '#2dd4bf',
  [HitType.OS_HIT]: '#fbbf24',
  [HitType.DISK_READ]: '#94a3b8',
};

export const WORKLOAD_DESCRIPTIONS: Record<WorkloadType, string> = {
  [WorkloadType.SEQUENTIAL]: 'Sequential scan pattern — predictable access',
  [WorkloadType.RANDOM]: 'Uniformly random block access',
  [WorkloadType.HOT_SPOT]: 'Skewed access to a small set of hot blocks',
  [WorkloadType.NETFLIX]: 'Streaming-like temporal locality with long tail',
  [WorkloadType.FLASH_SALE]: 'Sudden traffic spike to a narrow working set',
  [WorkloadType.MULTI_TENANT]: 'Isolated working sets per tenant',
  [WorkloadType.STARTUP_BUDGET]: 'Small cache budget, memory-constrained',
};

export const STRATEGY_DESCRIPTIONS: Record<Strategy, string> = {
  [Strategy.DOUBLE_CACHING]: 'Both DB and OS cache independently — maximum duplication',
  [Strategy.COORDINATED]: 'DB informs OS of cached blocks — minimal duplication',
  [Strategy.DIRECT_IO]: 'Bypasses OS page cache entirely — no duplication, more disk reads',
  [Strategy.ADAPTIVE]: 'Switches strategy per workload — balanced efficiency',
};
