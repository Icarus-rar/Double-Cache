import { ComparisonRow, RunSummary, Strategy, WorkloadType } from '@/types';
import { getMockRuns, getMockRunById, getRunsByWorkload, getRunsByStrategy } from '@/mock/runs';

export interface ISimulationService {
  getRuns(): RunSummary[];
  getRunById(id: string): RunSummary | undefined;
  getRunsByWorkload(workload: WorkloadType): RunSummary[];
  getRunsByStrategy(strategy: Strategy): RunSummary[];
  getComparisonForWorkload(workload: WorkloadType): ComparisonRow[];
  getAllComparisons(): Record<WorkloadType, ComparisonRow[]>;
}

class MockSimulationService implements ISimulationService {
  getRuns(): RunSummary[] {
    return getMockRuns();
  }

  getRunById(id: string): RunSummary | undefined {
    return getMockRunById(id);
  }

  getRunsByWorkload(workload: WorkloadType): RunSummary[] {
    return getRunsByWorkload(workload);
  }

  getRunsByStrategy(strategy: Strategy): RunSummary[] {
    return getRunsByStrategy(strategy);
  }

  getComparisonForWorkload(workload: WorkloadType): ComparisonRow[] {
    const runs = getRunsByWorkload(workload);
    return Object.values(Strategy).map((strategy) => {
      const run = runs.find((r) => r.strategy === strategy);
      if (!run) {
        return {
          strategy,
          avgLatencyMs: 0,
          p50LatencyMs: 0,
          p95LatencyMs: 0,
          p99LatencyMs: 0,
          dbHitRate: 0,
          osHitRate: 0,
          diskReads: 0,
          duplicationPercent: 0,
          memoryWasteMb: 0,
        };
      }
      return {
        strategy: run.strategy,
        avgLatencyMs: run.avgLatencyMs,
        p50LatencyMs: run.p50LatencyMs,
        p95LatencyMs: run.p95LatencyMs,
        p99LatencyMs: run.p99LatencyMs,
        dbHitRate: run.dbHitRate,
        osHitRate: run.osHitRate,
        diskReads: run.diskReads,
        duplicationPercent: run.duplicationPercent,
        memoryWasteMb: run.memoryWasteMb,
      };
    });
  }

  getAllComparisons(): Record<WorkloadType, ComparisonRow[]> {
    const result = {} as Record<WorkloadType, ComparisonRow[]>;
    for (const wl of Object.values(WorkloadType)) {
      result[wl] = this.getComparisonForWorkload(wl);
    }
    return result;
  }
}

let _service: ISimulationService | null = null;

export function getSimulationService(): ISimulationService {
  if (!_service) {
    _service = new MockSimulationService();
  }
  return _service;
}

export function setSimulationService(service: ISimulationService): void {
  _service = service;
}
