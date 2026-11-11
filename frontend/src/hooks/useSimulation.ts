
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HitType,
  SimulationStatus,
  Strategy,
  WorkloadType,
  type SimulationConfig,
  type SimulationState,
} from '@/types';
import {
  runRealSimulation,
  type SimulationResponse,
} from '@/services/simulationApi';
import {
  adaptSimulationHistory,
  type AdaptedSimulationStep,
} from '@/services/simulationAdapter';
import { createInitialState } from '@/mock/simulation';

const DEFAULT_CONFIG: SimulationConfig = {
  workload: WorkloadType.SEQUENTIAL,
  strategy: Strategy.DOUBLE_CACHING,
  dbCacheSize: 8,
  osCacheSize: 8,
  speed: 5,
  totalSteps: 1000,
};

export interface UseSimulationReturn {
  state: SimulationState;
  config: SimulationConfig;
  start: () => void;
  pause: () => void;
  reset: () => void;
  updateConfig: (partial: Partial<SimulationConfig>) => void;
  isRunning: boolean;
  isPaused: boolean;
  isComplete: boolean;
}

function toApiWorkload(workload: WorkloadType) {
  switch (workload) {
    case WorkloadType.SEQUENTIAL:
      return 'sequential' as const;
    case WorkloadType.RANDOM:
      return 'random' as const;
    case WorkloadType.HOT_SPOT:
      return 'hotspot' as const;
    default:
      throw new Error(
        `The Python backend does not support the "${workload}" workload yet.`,
      );
  }
}

function toApiCacheMode(strategy: Strategy) {
  switch (strategy) {
    case Strategy.DOUBLE_CACHING:
      return 'double_caching' as const;
    case Strategy.COORDINATED:
      return 'coordinated' as const;
    default:
      throw new Error(
        `The Python backend does not support the "${strategy}" strategy yet.`,
      );
  }
}

function makePlaybackState(
  config: SimulationConfig,
  previousState: SimulationState,
  step: AdaptedSimulationStep,
  history: AdaptedSimulationStep[],
  visibleSteps: number,
): SimulationState {
  const historyPoints = history
    .slice(0, visibleSteps)
    .map((entry) => entry.historyPoint);

  return {
    ...previousState,
    config,
    metrics: step.metrics,
    dbCache: step.dbCache,
    osCache: step.osCache,
    duplicatedBlockIds: step.duplicatedBlockIds,
    history: historyPoints,
  };
}

export function useSimulation(): UseSimulationReturn {
  const [config, setConfig] = useState<SimulationConfig>(DEFAULT_CONFIG);
  const [state, setState] = useState<SimulationState>(() =>
    createInitialState(DEFAULT_CONFIG),
  );
  const [status, setStatus] = useState<SimulationStatus>(
    SimulationStatus.READY,
  );
  const [error, setError] = useState<string | null>(null);

  const historyRef = useRef<AdaptedSimulationStep[]>([]);
  const responseRef = useRef<SimulationResponse | null>(null);
  const stepRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const requestIdRef = useRef(0);
  const loadingRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    requestIdRef.current++;
    loadingRef.current = false;
    clearTimer();
    stepRef.current = 0;
    historyRef.current = [];
    responseRef.current = null;
    setError(null);
    setStatus(SimulationStatus.READY);
    setState(createInitialState(config));
  }, [clearTimer, config]);

  const start = useCallback(async () => {
    if (
      loadingRef.current ||
      status === SimulationStatus.RUNNING ||
      status === SimulationStatus.COMPLETE
    ) {
      return;
    }

    setError(null);

    if (historyRef.current.length === 0) {
      loadingRef.current = true;
      const requestId = ++requestIdRef.current;

      try {
        const response = await runRealSimulation({
          workload: toApiWorkload(config.workload),
          num_accesses: config.totalSteps,
          db_cache_size: config.dbCacheSize,
          os_cache_size: config.osCacheSize,
          total_blocks: Math.max(100, config.totalSteps),
          cache_mode: toApiCacheMode(config.strategy),
        });

        if (requestId !== requestIdRef.current) return;

        responseRef.current = response;
        historyRef.current = adaptSimulationHistory(response);
        stepRef.current = 0;
      } catch (err) {
        if (requestId === requestIdRef.current) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to run the Python simulation.',
          );
        }
        return;
      } finally {
        if (requestId === requestIdRef.current) {
          loadingRef.current = false;
        }
      }
    }

    if (historyRef.current.length === 0) {
      setError('The backend returned no simulation history.');
      return;
    }

    setStatus(SimulationStatus.RUNNING);
  }, [config, status]);

  const pause = useCallback(() => {
    clearTimer();
    setStatus((current) =>
      current === SimulationStatus.RUNNING
        ? SimulationStatus.PAUSED
        : current,
    );
  }, [clearTimer]);

  const updateConfig = useCallback(
    (partial: Partial<SimulationConfig>) => {
      clearTimer();
      requestIdRef.current++;
      loadingRef.current = false;
      stepRef.current = 0;
      historyRef.current = [];
      responseRef.current = null;
      setError(null);
      setStatus(SimulationStatus.READY);

      setConfig((previous) => {
        const next = { ...previous, ...partial };
        setState(createInitialState(next));
        return next;
      });
    },
    [clearTimer],
  );

  useEffect(() => {
    if (status !== SimulationStatus.RUNNING) return;

    const intervalMs = Math.max(50, 500 - config.speed * 45);

    clearTimer();

    intervalRef.current = setInterval(() => {
      const history = historyRef.current;

      if (stepRef.current >= history.length) {
        clearTimer();
        setStatus(SimulationStatus.COMPLETE);
        return;
      }

      stepRef.current += 1;

      const currentStep = history[stepRef.current - 1];

      setState((previousState) =>
        makePlaybackState(
          config,
          previousState,
          currentStep,
          history,
          stepRef.current,
        ),
      );

      if (stepRef.current >= history.length) {
        clearTimer();
        setStatus(SimulationStatus.COMPLETE);
      }
    }, intervalMs);

    return clearTimer;
  }, [status, config, clearTimer]);

  useEffect(() => {
    return () => {
      clearTimer();
      requestIdRef.current++;
    };
  }, [clearTimer]);

  return {
    state: {
      ...state,
      status,
      // Kept for compatibility with the current hook's public interface.
      config,
    },
    config,
    start,
    pause,
    reset,
    updateConfig,
    isRunning: status === SimulationStatus.RUNNING,
    isPaused: status === SimulationStatus.PAUSED,
    isComplete: status === SimulationStatus.COMPLETE,
  };
}
