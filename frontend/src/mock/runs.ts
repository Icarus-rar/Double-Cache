import { RunSummary, SimulationHistoryPoint, Strategy, WorkloadType } from '@/types';
import { createRng, type Rng } from './simulation';

interface StrategyProfile {
  avgLatencyBase: number;
  latencyVariance: number;
  dbHitRateRange: [number, number];
  osHitRateRange: [number, number];
  diskReadRate: number;
  duplicationRange: [number, number];
  memoryWasteBase: number;
}

const STRATEGY_PROFILES: Record<Strategy, StrategyProfile> = {
  [Strategy.DOUBLE_CACHING]: {
    avgLatencyBase: 0.35,
    latencyVariance: 0.15,
    dbHitRateRange: [0.78, 0.92],
    osHitRateRange: [0.08, 0.18],
    diskReadRate: 0.05,
    duplicationRange: [25, 55],
    memoryWasteBase: 4.5,
  },
  [Strategy.COORDINATED]: {
    avgLatencyBase: 0.42,
    latencyVariance: 0.12,
    dbHitRateRange: [0.72, 0.86],
    osHitRateRange: [0.02, 0.06],
    diskReadRate: 0.12,
    duplicationRange: [2, 8],
    memoryWasteBase: 0.6,
  },
  [Strategy.DIRECT_IO]: {
    avgLatencyBase: 0.68,
    latencyVariance: 0.25,
    dbHitRateRange: [0.65, 0.82],
    osHitRateRange: [0.0, 0.0],
    diskReadRate: 0.22,
    duplicationRange: [0, 0],
    memoryWasteBase: 0.0,
  },
  [Strategy.ADAPTIVE]: {
    avgLatencyBase: 0.38,
    latencyVariance: 0.14,
    dbHitRateRange: [0.76, 0.88],
    osHitRateRange: [0.03, 0.09],
    diskReadRate: 0.10,
    duplicationRange: [5, 15],
    memoryWasteBase: 1.2,
  },
};

const WORKLOAD_LATENCY_MODIFIER: Record<WorkloadType, number> = {
  [WorkloadType.SEQUENTIAL]: 0.8,
  [WorkloadType.RANDOM]: 1.2,
  [WorkloadType.HOT_SPOT]: 0.9,
  [WorkloadType.NETFLIX]: 1.0,
  [WorkloadType.FLASH_SALE]: 1.4,
  [WorkloadType.MULTI_TENANT]: 1.1,
  [WorkloadType.STARTUP_BUDGET]: 1.3,
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function jitter(rng: Rng, base: number, variance: number): number {
  return base + (rng() - 0.5) * 2 * variance;
}

function generateHistory(
  rng: Rng,
  totalSteps: number,
  profile: StrategyProfile,
  workloadMod: number,
): SimulationHistoryPoint[] {
  const points: SimulationHistoryPoint[] = [];
  const sampleInterval = Math.max(1, Math.floor(totalSteps / 100));
  let cumulativeDiskReads = 0;

  const targetDuplication = lerp(profile.duplicationRange[0], profile.duplicationRange[1], rng());
  const targetDbHitRate = lerp(profile.dbHitRateRange[0], profile.dbHitRateRange[1], rng());
  const targetOsHitRate = lerp(profile.osHitRateRange[0], profile.osHitRateRange[1], rng());

  for (let step = 1; step <= totalSteps; step++) {
    const progress = step / totalSteps;
    const rampUp = 1 - Math.exp(-3 * progress);

    const dbHitRate = targetDbHitRate * rampUp + jitter(rng, 0, 0.03);
    const osHitRate = targetOsHitRate * rampUp + jitter(rng, 0, 0.02);
    const duplicationPercent =
      profile.duplicationRange[0] === 0 && profile.duplicationRange[1] === 0
        ? 0
        : targetDuplication * rampUp + jitter(rng, 0, 3);

    if (rng() < profile.diskReadRate * workloadMod) {
      cumulativeDiskReads++;
    }

    const latency = jitter(rng, profile.avgLatencyBase * workloadMod, profile.latencyVariance * workloadMod);

    if (step % sampleInterval === 0 || step === totalSteps) {
      points.push({
        step,
        duplicationPercent: clamp(duplicationPercent, 0, 100),
        latencyMs: clamp(latency, 0.02, 12),
        dbHitRate: clamp(dbHitRate, 0, 1),
        osHitRate: clamp(osHitRate, 0, 1),
        diskReads: cumulativeDiskReads,
      });
    }
  }
  return points;
}

function computePercentiles(history: SimulationHistoryPoint[]): {
  avg: number;
  p50: number;
  p95: number;
  p99: number;
} {
  if (history.length === 0) return { avg: 0, p50: 0, p95: 0, p99: 0 };
  const latencies = history.map((h) => h.latencyMs).sort((a, b) => a - b);
  const idx = (p: number) => Math.min(latencies.length - 1, Math.floor(latencies.length * p));
  const avg = latencies.reduce((s, v) => s + v, 0) / latencies.length;
  return {
    avg,
    p50: latencies[idx(0.5)],
    p95: latencies[idx(0.95)],
    p99: latencies[idx(0.99)],
  };
}

function generateRun(
  rng: Rng,
  workload: WorkloadType,
  strategy: Strategy,
  date: string,
  id: string,
): RunSummary {
  const profile = STRATEGY_PROFILES[strategy];
  const workloadMod = WORKLOAD_LATENCY_MODIFIER[workload];
  const totalSteps = 500 + Math.floor(rng() * 800);

  const history = generateHistory(rng, totalSteps, profile, workloadMod);
  const lastPoint = history[history.length - 1];
  const percentiles = computePercentiles(history);

  const duplicationPercent = lastPoint.duplicationPercent;
  const memoryWasteMb = duplicationPercent * 0.08 * profile.memoryWasteBase;

  return {
    id,
    workload,
    strategy,
    date,
    totalSteps,
    avgLatencyMs: percentiles.avg,
    p50LatencyMs: percentiles.p50,
    p95LatencyMs: percentiles.p95,
    p99LatencyMs: percentiles.p99,
    dbHitRate: lastPoint.dbHitRate,
    osHitRate: lastPoint.osHitRate,
    diskReads: lastPoint.diskReads,
    duplicationPercent,
    memoryWasteMb,
    history,
  };
}

const WORKLOADS = Object.values(WorkloadType);
const STRATEGIES = Object.values(Strategy);

const DATES = [
  '2026-09-28T09:14:00Z',
  '2026-09-28T11:32:00Z',
  '2026-09-29T08:45:00Z',
  '2026-09-29T14:20:00Z',
  '2026-09-30T10:05:00Z',
  '2026-09-30T16:48:00Z',
  '2026-10-01T09:30:00Z',
  '2026-10-01T13:15:00Z',
  '2026-10-02T08:00:00Z',
  '2026-10-02T15:42:00Z',
  '2026-10-03T10:18:00Z',
  '2026-10-03T14:55:00Z',
  '2026-10-04T09:10:00Z',
  '2026-10-04T11:40:00Z',
  '2026-10-05T08:25:00Z',
  '2026-10-05T13:30:00Z',
  '2026-10-05T16:50:00Z',
  '2026-10-06T09:00:00Z',
  '2026-10-06T11:20:00Z',
  '2026-10-06T14:30:00Z',
];

let _cachedRuns: RunSummary[] | null = null;

export function getMockRuns(): RunSummary[] {
  if (_cachedRuns) return _cachedRuns;

  const rng = createRng(42);
  const runs: RunSummary[] = [];
  let dateIdx = 0;

  for (const workload of WORKLOADS) {
    for (const strategy of STRATEGIES) {
      const date = DATES[dateIdx % DATES.length];
      dateIdx++;
      const id = `run-${String(runs.length + 1).padStart(3, '0')}`;
      runs.push(generateRun(rng, workload, strategy, date, id));
    }
  }

  _cachedRuns = runs;
  return runs;
}

export function getMockRunById(id: string): RunSummary | undefined {
  return getMockRuns().find((r) => r.id === id);
}

export function getRunsByWorkload(workload: WorkloadType): RunSummary[] {
  return getMockRuns().filter((r) => r.workload === workload);
}

export function getRunsByStrategy(strategy: Strategy): RunSummary[] {
  return getMockRuns().filter((r) => r.strategy === strategy);
}
