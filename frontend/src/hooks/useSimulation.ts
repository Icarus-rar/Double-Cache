import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SimulationConfig,
  SimulationState,
  SimulationStatus,
  Strategy,
  WorkloadType,
} from '@/types';
import {
  createInitialState,
  createRuntime,
  stepSimulation,
  type SimulationRuntime,
} from '@/mock/simulation';

const DEFAULT_CONFIG: SimulationConfig = {
  workload: WorkloadType.NETFLIX,
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

export function useSimulation(): UseSimulationReturn {
  const [config, setConfig] = useState<SimulationConfig>(DEFAULT_CONFIG);
  const [state, setState] = useState<SimulationState>(() => createInitialState(DEFAULT_CONFIG));
  const [status, setStatus] = useState<SimulationStatus>(SimulationStatus.READY);
  const runtimeRef = useRef<SimulationRuntime | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    stepRef.current = 0;
    runtimeRef.current = null;
    setStatus(SimulationStatus.READY);
    setState(createInitialState(config));
  }, [config, clearTimer]);

  const start = useCallback(() => {
    if (status === SimulationStatus.COMPLETE) return;
    if (!runtimeRef.current) {
      runtimeRef.current = createRuntime(config);
    }
    setStatus(SimulationStatus.RUNNING);
  }, [config, status]);

  const pause = useCallback(() => {
    setStatus(SimulationStatus.PAUSED);
    clearTimer();
  }, [clearTimer]);

  const updateConfig = useCallback((partial: Partial<SimulationConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...partial };
      if (partial.workload || partial.strategy || partial.dbCacheSize || partial.osCacheSize) {
        stepRef.current = 0;
        runtimeRef.current = null;
        setStatus(SimulationStatus.READY);
        setState(createInitialState(next));
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (status !== SimulationStatus.RUNNING) return;

    const intervalMs = Math.max(50, 500 - config.speed * 45);
    clearTimer();
    intervalRef.current = setInterval(() => {
      if (!runtimeRef.current) {
        runtimeRef.current = createRuntime(config);
      }
      if (stepRef.current >= config.totalSteps) {
        setStatus(SimulationStatus.COMPLETE);
        clearTimer();
        return;
      }
      stepRef.current++;
      const { state: newState } = stepSimulation(config, runtimeRef.current, stepRef.current);
      setState(newState);
    }, intervalMs);

    return clearTimer;
  }, [status, config, clearTimer]);

  useEffect(() => {
    if (status === SimulationStatus.COMPLETE) {
      clearTimer();
    }
  }, [status, clearTimer]);

  return {
    state: { ...state, status },
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
