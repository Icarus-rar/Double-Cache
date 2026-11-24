import { useState, useRef, useCallback, useEffect } from 'react';
import { SimulationConfig, SimulationStatus, SimulationHistoryPoint, Strategy, CacheBlock } from '@/types';

// The exact shape returned by your Python FastAPI backend
export interface TelemetryPoint {
  step_no: number;
  page_id: number;
  operation: "READ" | "WRITE";
  hit_type: "DB_HIT" | "OS_HIT" | "DISK_HIT";
  latency_ms: number;
  db_cache_hit_ratio: number;
  os_cache_hit_ratio: number;
  duplication_rate: number;
  cumulative_disk_reads: number;
  is_thrashing_step: boolean;
}

export interface PlaybackState {
  status: SimulationStatus;
  currentStepIndex: number;
  telemetry: TelemetryPoint[];
  historyWindow: SimulationHistoryPoint[]; // Feeds the Recharts graphs
  dbCache: CacheBlock[];                   // Feeds the visual UI tiles
  osCache: CacheBlock[];                   // Feeds the visual UI tiles
  duplicatedBlockIds: number[];
  error: string | null;
}

export function usePlayback(config: SimulationConfig) {
  const [state, setState] = useState<PlaybackState>({
    status: SimulationStatus.READY,
    currentStepIndex: 0,
    telemetry: [],
    historyWindow: [],
    dbCache: [],
    osCache: [],
    duplicatedBlockIds: [],
    error: null,
  });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  // 1. Fetch real data from FastAPI
  const startSimulation = useCallback(async () => {
    clearTimer();
    setState(prev => ({ 
      ...prev, status: SimulationStatus.RUNNING, error: null, currentStepIndex: 0, 
      telemetry: [], historyWindow: [], dbCache: [], osCache: [] 
    }));
    
    try {
      // Map frontend strategy names to FastAPI backend names
      let cacheMode = "DOUBLE_CACHING";
      if (config.strategy === Strategy.COORDINATED) cacheMode = "COORDINATED";
      if (config.strategy === Strategy.DIRECT_IO) cacheMode = "O_DIRECT";

      // Map Workloads to your Python Scenarios
      let scenario = "scenario1"; // Flash Sale
      if (config.workload === "Netflix") scenario = "scenario2";
      if (config.workload === "Multi-Tenant") scenario = "scenario3";

      const response = await fetch("http://127.0.0.1:8000/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario_name: scenario,
          db_cache_size: config.dbCacheSize,
          os_cache_size: config.osCacheSize,
          coordination_mode: cacheMode,
          replacement_policy: "LRU",
          num_steps: config.totalSteps,
          write_ratio: 0.2,
        }),
      });

      if (!response.ok) throw new Error(`Backend Error ${response.status}`);
      const data = await response.json();
      
      setState(prev => ({ ...prev, telemetry: data.telemetry, status: SimulationStatus.RUNNING }));
    } catch (err: any) {
      setState(prev => ({ ...prev, status: SimulationStatus.READY, error: err.message }));
    }
  }, [config, clearTimer]);

  // 2. Playback Loop (Animates the graphs and tiles)
  useEffect(() => {
    if (state.status !== SimulationStatus.RUNNING || state.telemetry.length === 0) return;

    // Speed calculation from the UI Slider
    const msPerStep = Math.max(10, 110 - (config.speed * 10));

    timerRef.current = setInterval(() => {
      setState(prev => {
        if (prev.currentStepIndex >= prev.telemetry.length - 1) {
          clearTimer();
          return { ...prev, status: SimulationStatus.COMPLETE };
        }

        const nextIndex = prev.currentStepIndex + 1;
        const currentPoint = prev.telemetry[nextIndex];
        const pageId = currentPoint.page_id;
        
        let newDbCache = [...prev.dbCache];
        let newOsCache = [...prev.osCache];
        
        // Emulate cache contents for visual UI tiles
        if (currentPoint.hit_type === "DB_HIT" || currentPoint.hit_type === "DISK_HIT") {
             if (!newDbCache.find(b => b.blockId === pageId)) {
                 newDbCache.unshift({ blockId: pageId, isDuplicated: false, recentlyAccessed: true, accessCount: 1 });
                 if (newDbCache.length > config.dbCacheSize) newDbCache.pop();
             }
        }
        if (currentPoint.hit_type === "DISK_HIT" && config.strategy === Strategy.DOUBLE_CACHING) {
             if (!newOsCache.find(b => b.blockId === pageId)) {
                 newOsCache.unshift({ blockId: pageId, isDuplicated: false, recentlyAccessed: true, accessCount: 1 });
                 if (newOsCache.length > config.osCacheSize) newOsCache.pop();
             }
        }

        const dbIds = newDbCache.map(b => b.blockId);
        const osIds = newOsCache.map(b => b.blockId);
        const duplicates = dbIds.filter(id => osIds.includes(id));

        newDbCache = newDbCache.map(b => ({ ...b, isDuplicated: duplicates.includes(b.blockId) }));
        newOsCache = newOsCache.map(b => ({ ...b, isDuplicated: duplicates.includes(b.blockId) }));

        // Send data to Recharts
        const newHistoryPoint: SimulationHistoryPoint = {
            step: currentPoint.step_no,
            latencyMs: currentPoint.latency_ms,
            duplicationPercent: currentPoint.duplication_rate * 100,
            dbHitRate: currentPoint.db_cache_hit_ratio,
            osHitRate: currentPoint.os_cache_hit_ratio,
            diskReads: currentPoint.cumulative_disk_reads
        };

        const newHistoryWindow = [...prev.historyWindow, newHistoryPoint];
        if (newHistoryWindow.length > 200) newHistoryWindow.shift(); // Keep UI fast

        return {
          ...prev,
          currentStepIndex: nextIndex,
          dbCache: newDbCache,
          osCache: newOsCache,
          duplicatedBlockIds: duplicates,
          historyWindow: newHistoryWindow
        };
      });
    }, msPerStep);

    return clearTimer;
  }, [state.status, state.telemetry, config.speed, config.dbCacheSize, config.osCacheSize, config.strategy, clearTimer]);

  const pausePlayback = () => { clearTimer(); setState(prev => ({ ...prev, status: SimulationStatus.PAUSED })); };
  const resumePlayback = () => { setState(prev => ({ ...prev, status: SimulationStatus.RUNNING })); };
  const resetPlayback = () => { clearTimer(); setState(prev => ({ ...prev, status: SimulationStatus.READY, currentStepIndex: 0, telemetry: [], historyWindow: [], dbCache: [], osCache: [], duplicatedBlockIds: [] })); };

  return { state, startSimulation, pausePlayback, resumePlayback, resetPlayback };
}