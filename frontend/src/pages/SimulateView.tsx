import { useMemo, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Settings2,
  Gauge,
  Database,
  HardDrive,
  Layers,
  Activity,
  Zap,
  Award,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import {
  Strategy,
  WorkloadType,
  SimulationStatus,
  HitType,
  type SimulationConfig,
} from '@/types';
import { usePlayback } from '@/hooks/usePlayback';
import { CacheVisualization } from '@/components/cache/CacheVisualization';
import { ClientTrafficCard } from '@/components/shared/ClientTrafficCard';
import { MetricStat } from '@/components/shared/MetricStat';
import { HitTypeBadge } from '@/components/shared/HitTypeBadge';
import { StatusIndicator } from '@/components/shared/StatusIndicator';
import { Timeline } from '@/components/shared/Timeline';
import { DuplicationChart } from '@/charts/DuplicationChart';
import { LatencyChart } from '@/charts/LatencyChart';
import { HitRateChart } from '@/charts/HitRateChart';
import { DiskReadsChart } from '@/charts/DiskReadsChart';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';

const ACTIVE_WORKLOADS: WorkloadType[] = [
  WorkloadType.FLASH_SALE,
  WorkloadType.NETFLIX,
  WorkloadType.MULTI_TENANT,
  WorkloadType.RAMMAP_PROOF, // <--- ADDED
];

const ACTIVE_STRATEGIES: Strategy[] = [
  Strategy.DOUBLE_CACHING,
  Strategy.DIRECT_IO,
  Strategy.COORDINATED,
];

const SCENARIO_DETAILS: Record<
  string,
  {
    title: string;
    pattern: string;
    bestStrategy: Strategy;
    reason: string;
  }
> = {
  [WorkloadType.FLASH_SALE]: {
    title: 'E-Commerce Flash Sale (Zipfian Hot-Spot)',
    pattern: '80% of traffic hammers the top 20 hot product/inventory pages simultaneously.',
    bestStrategy: Strategy.COORDINATED,
    reason:
      'Coordinated Caching (posix_fadvise) works best here: it eliminates 100% of duplicate hot inventory pages between InnoDB and Linux while keeping the OS Page Cache available for static web assets and read-ahead.',
  },
  [WorkloadType.NETFLIX]: {
    title: 'Netflix Streaming / CDN (Sequential Flooding)',
    pattern: '30% hot user/catalog metadata lookups mixed with 70% large sequential media block reads.',
    bestStrategy: Strategy.COORDINATED,
    reason:
      'Coordinated Caching (POSIX_FADV_DONTNEED) is optimal: streaming sequential video chunks through default Double Caching pollutes the OS cache and evicts hot metadata, whereas Coordinated mode drops streamed blocks immediately after transfer.',
  },
  [WorkloadType.MULTI_TENANT]: {
    title: 'Hypervisor / Cloud VM (Noisy Neighbor Isolation)',
    pattern: 'Latency-sensitive Tenant A shares host RAM with Tenant B running a heavy sequential backup.',
    bestStrategy: Strategy.DIRECT_IO,
    reason:
      'Direct I/O (O_DIRECT) is the strongest choice for multi-tenant isolation: bypassing the shared host OS Page Cache prevents Tenant B’s bulk scan from evicting Tenant A’s active working set.',
  },
  [WorkloadType.RAMMAP_PROOF]: { // <--- ADDED
    title: 'Windows RAMMap Physical Proof',
    pattern: 'Full table scan (SELECT COUNT(*)) mirroring the live 376MB RamMap experiment.',
    bestStrategy: Strategy.DIRECT_IO,
    reason:
      'A full table scan sequentially reads every page exactly once. Under default Double Caching, this floods both the InnoDB Buffer Pool and OS Page Cache, effectively doubling memory usage. Direct I/O (O_DIRECT) bypasses the OS cache entirely, saving 376MB of physical RAM.',
  },
};

export function SimulateView() {
  const [config, setConfig] = useState<SimulationConfig>({
    workload: WorkloadType.FLASH_SALE,
    strategy: Strategy.DOUBLE_CACHING,
    dbCacheSize: 16,
    osCacheSize: 16,
    speed: 6,
    totalSteps: 500,
  });

  const { state, startSimulation, pausePlayback, resumePlayback, resetPlayback } =
    usePlayback(config);

  const updateConfig = (partial: Partial<SimulationConfig>) => {
    resetPlayback();
    setConfig((prev) => ({ ...prev, ...partial }));
  };

  // Derive live cumulative metrics up to the active playback frame
  const liveMetrics = useMemo(() => {
    const activeSlice = state.telemetry.slice(0, state.currentStepIndex + 1);
    const currentPoint = state.telemetry[state.currentStepIndex];

    if (!currentPoint || activeSlice.length === 0) {
      return {
        step: 0,
        blockId: 0,
        hitType: HitType.DISK_READ,
        latencyMs: 0,
        dbCacheHits: 0,
        osCacheHits: 0,
        diskReads: 0,
        dbCacheMisses: 0,
        osCacheMisses: 0,
        duplicationPercent: 0,
        dbHitRate: 0,
        osHitRate: 0,
        memoryWasteMb: 0,
      };
    }

    let dbHits = 0;
    let osHits = 0;
    let diskHits = 0;

    for (const p of activeSlice) {
      if (p.hit_type === 'DB_HIT') dbHits++;
      else if (p.hit_type === 'OS_HIT') osHits++;
      else diskHits++;
    }

    const mappedHitType =
      currentPoint.hit_type === 'DB_HIT'
        ? HitType.DB_HIT
        : currentPoint.hit_type === 'OS_HIT'
          ? HitType.OS_HIT
          : HitType.DISK_READ;

    // 16 KB per InnoDB database page -> convert duplicate block count to MB
    const memoryWasteMb = (state.duplicatedBlockIds.length * 16) / 1024;

    return {
      step: currentPoint.step_no,
      blockId: currentPoint.page_id,
      hitType: mappedHitType,
      latencyMs: currentPoint.latency_ms,
      dbCacheHits: dbHits,
      osCacheHits: osHits,
      diskReads: currentPoint.cumulative_disk_reads,
      dbCacheMisses: osHits + diskHits,
      osCacheMisses: diskHits,
      duplicationPercent: currentPoint.duplication_rate * 100,
      dbHitRate: currentPoint.db_cache_hit_ratio,
      osHitRate: currentPoint.os_cache_hit_ratio,
      memoryWasteMb,
    };
  }, [state.telemetry, state.currentStepIndex, state.duplicatedBlockIds.length]);

  const isRunning = state.status === SimulationStatus.RUNNING;
  const isPaused = state.status === SimulationStatus.PAUSED;
  const isComplete = state.status === SimulationStatus.COMPLETE;

  const scenarioInfo = SCENARIO_DETAILS[config.workload] ?? SCENARIO_DETAILS[WorkloadType.FLASH_SALE];

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      {/* Top Status Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/40 bg-muted/20 px-4 py-2.5">
        <StatusIndicator status={state.status} />
        <div className="h-4 w-px bg-border/60" />
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Strategy:</span>
          <span className="font-mono font-semibold text-foreground">{config.strategy}</span>
        </div>
        <div className="h-4 w-px bg-border/60" />
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Scenario:</span>
          <span className="font-mono font-semibold text-teal-400">{scenarioInfo.title}</span>
        </div>
        <div className="ml-auto flex items-center gap-3 font-mono text-xs text-muted-foreground">
          <span className="tabular-nums">
            DB: <span className="text-teal-400">{config.dbCacheSize}</span>
          </span>
          <span className="tabular-nums">
            OS: <span className="text-amber-400">{config.osCacheSize}</span>
          </span>
          <span className="tabular-nums">
            Speed: <span className="text-foreground">{config.speed}x</span>
          </span>
        </div>
      </div>

      {state.error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-950/30 px-4 py-2.5 text-xs text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>Backend Error: {state.error} (Verify FastAPI is running on 127.0.0.1:8000)</span>
        </div>
      )}

      {/* Main 3-Column Grid: Controls | Cache Visualization | Live Metrics */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[270px_1fr_250px]">
        {/* Left: Control Panel */}
        <div className="glass-card rounded-lg p-4">
          <div className="mb-4 flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Configuration
            </h2>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-muted-foreground">
                Real-World Workload
              </label>
              <Select
                value={config.workload}
                onValueChange={(v) => updateConfig({ workload: v as WorkloadType })}
                disabled={isRunning}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVE_WORKLOADS.map((w) => (
                    <SelectItem key={w} value={w} className="text-xs">
                      {w}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1.5 rounded border border-border/40 bg-muted/20 p-2 text-[11px] leading-relaxed text-muted-foreground">
                {scenarioInfo.pattern}
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-muted-foreground">
                Caching Strategy
              </label>
              <Select
                value={config.strategy}
                onValueChange={(v) => updateConfig({ strategy: v as Strategy })}
                disabled={isRunning}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVE_STRATEGIES.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <Database className="h-3 w-3 text-teal-400" />
                  DB Buffer Pool
                </label>
                <span className="font-mono text-xs tabular-nums text-teal-400">
                  {config.dbCacheSize} pages
                </span>
              </div>
              <Slider
                value={[config.dbCacheSize]}
                min={8}
                max={32}
                step={4}
                disabled={isRunning}
                onValueChange={(v) => updateConfig({ dbCacheSize: v[0] })}
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <HardDrive className="h-3 w-3 text-amber-400" />
                  OS Page Cache
                </label>
                <span className="font-mono text-xs tabular-nums text-amber-400">
                  {config.osCacheSize} pages
                </span>
              </div>
              <Slider
                value={[config.osCacheSize]}
                min={8}
                max={32}
                step={4}
                disabled={isRunning}
                onValueChange={(v) => updateConfig({ osCacheSize: v[0] })}
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <Gauge className="h-3 w-3" />
                  Playback Speed
                </label>
                <span className="font-mono text-xs tabular-nums text-foreground">
                  {config.speed}x
                </span>
              </div>
              <Slider
                value={[config.speed]}
                min={1}
                max={10}
                step={1}
                onValueChange={(v) => setConfig((prev) => ({ ...prev, speed: v[0] }))}
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <Layers className="h-3 w-3" />
                  Total Steps
                </label>
                <span className="font-mono text-xs tabular-nums text-foreground">
                  {config.totalSteps.toLocaleString()}
                </span>
              </div>
              <Slider
                value={[config.totalSteps]}
                min={100}
                max={1000}
                step={100}
                disabled={isRunning}
                onValueChange={(v) => updateConfig({ totalSteps: v[0] })}
              />
            </div>

            <div className="mt-2 flex flex-col gap-2">
              <Button
                onClick={isPaused ? resumePlayback : startSimulation}
                disabled={isRunning || isComplete}
                className="h-9 gap-1.5 bg-teal-600 text-xs font-semibold hover:bg-teal-500"
                size="sm"
              >
                <Play className="h-4 w-4" />
                {isPaused ? 'Resume' : 'Start Simulation'}
              </Button>
              <div className="flex gap-2">
                <Button
                  onClick={pausePlayback}
                  disabled={!isRunning}
                  variant="outline"
                  className="h-9 flex-1 gap-1.5 text-xs"
                  size="sm"
                >
                  <Pause className="h-3.5 w-3.5" />
                  Pause
                </Button>
                <Button
                  onClick={resetPlayback}
                  variant="outline"
                  className="h-9 flex-1 gap-1.5 text-xs"
                  size="sm"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Live Dual-Layer Cache Visualization */}
        <div className="flex flex-col gap-3">
          
          <ClientTrafficCard 
            workload={config.workload}
            currentStep={liveMetrics.step}
            currentPageId={liveMetrics.blockId}
            currentOp={state.telemetry[state.currentStepIndex]?.operation ?? 'READ'}
            isRunning={isRunning}
          />
          
          <CacheVisualization
            dbBlocks={state.dbCache}
            osBlocks={state.osCache}
            dbCacheSize={config.dbCacheSize}
            osCacheSize={config.osCacheSize}
            duplicatedBlockIds={state.duplicatedBlockIds}
            currentBlockId={liveMetrics.blockId}
          />
        </div>

        {/* Right: Live Telemetry Metrics */}
        <div className="glass-card rounded-lg p-4">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Live Telemetry
            </h2>
          </div>

          <div className="mb-4 rounded-md border border-border/40 bg-muted/20 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              Current Access
            </div>
            <div className="mb-2 flex items-center justify-between">
              <MetricStat label="Step" value={liveMetrics.step} size="lg" color="default" />
              <HitTypeBadge hitType={liveMetrics.hitType} size="sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MetricStat
                label="Page ID"
                value={liveMetrics.blockId}
                size="sm"
                color="default"
                icon={<Zap className="h-2.5 w-2.5" />}
              />
              <MetricStat
                label="Latency"
                value={liveMetrics.latencyMs.toFixed(2)}
                unit="ms"
                size="sm"
                color={liveMetrics.latencyMs > 2 ? 'dup' : liveMetrics.latencyMs > 0.5 ? 'os' : 'db'}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Cumulative Counters
            </div>
            <MetricStat label="DB Cache Hits" value={liveMetrics.dbCacheHits} color="db" size="sm" />
            <MetricStat label="OS Cache Hits" value={liveMetrics.osCacheHits} color="os" size="sm" />
            <MetricStat label="Disk Reads" value={liveMetrics.diskReads} color="muted" size="sm" />

            <div className="my-1 h-px bg-border/40" />

            <div className="rounded-md border border-red-500/20 bg-red-950/20 p-2.5">
              <MetricStat
                label="Duplicated Pages"
                value={state.duplicatedBlockIds.length}
                color="dup"
                size="md"
              />
              <div className="mt-2">
                <MetricStat
                  label="Duplication Rate"
                  value={liveMetrics.duplicationPercent.toFixed(1)}
                  unit="%"
                  color="dup"
                  size="md"
                />
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted/50">
                  <div
                    className="h-full rounded-full bg-red-500 transition-all duration-300"
                    style={{
                      width: `${Math.min(100, liveMetrics.duplicationPercent)}%`,
                      boxShadow: '0 0 8px rgba(239,68,68,0.5)',
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <MetricStat
                label="DB Hit Rate"
                value={(liveMetrics.dbHitRate * 100).toFixed(1)}
                unit="%"
                color="db"
                size="sm"
              />
              <MetricStat
                label="OS Hit Rate"
                value={(liveMetrics.osHitRate * 100).toFixed(1)}
                unit="%"
                color="os"
                size="sm"
              />
            </div>

            <MetricStat
              label="Wasted RAM (16KB/pg)"
              value={liveMetrics.memoryWasteMb.toFixed(2)}
              unit="MB"
              color="dup"
              size="sm"
            />
          </div>
        </div>
      </div>

      {/* Live-Drawing Telemetry Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <ChartCard title="Duplication %" subtitle="X: Step | Y: Redundant %">
          <DuplicationChart data={state.historyWindow} height={170} />
        </ChartCard>
        <ChartCard title="Access Latency" subtitle="X: Step | Y: Latency (ms)">
          <LatencyChart data={state.historyWindow} height={170} />
        </ChartCard>
        <ChartCard title="Layer Hit Ratio" subtitle="X: Step | Y: DB vs OS Hit %">
          <HitRateChart data={state.historyWindow} height={170} />
        </ChartCard>
        <ChartCard title="Cumulative Disk Reads" subtitle="X: Step | Y: Physical I/Os">
          <DiskReadsChart data={state.historyWindow} height={170} />
        </ChartCard>
      </div>

      {/* Progress Timeline */}
      <Timeline
        currentStep={liveMetrics.step}
        totalSteps={config.totalSteps}
        status={state.status}
      />

      {/* Automated Strategy Diagnosis & Best Technique Verdict */}
      <div className="glass-card rounded-lg border-l-4 border-l-teal-500 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-teal-400" />
            <h3 className="text-sm font-bold text-foreground">
              Diagnostic Verdict & Best Technique — {scenarioInfo.title}
            </h3>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-teal-500/40 bg-teal-950/40 px-2.5 py-1 font-mono text-xs font-semibold text-teal-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Recommended: {scenarioInfo.bestStrategy}
          </span>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {scenarioInfo.reason}
        </p>

        {state.telemetry.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-border/40 pt-2.5 font-mono text-[11px]">
            <span className="text-muted-foreground">
              Active Mode Diagnosis:{' '}
              {config.strategy === Strategy.DOUBLE_CACHING ? (
                <span className="text-red-400">
                  Phantom capacity detected ({liveMetrics.duplicationPercent.toFixed(1)}% page overlap). Re-run with{' '}
                  <strong>{scenarioInfo.bestStrategy}</strong> to compare.
                </span>
              ) : (
                <span className="text-green-400">
                  Mitigation active ({config.strategy}) — cross-layer page duplication eliminated.
                </span>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-card rounded-lg p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold text-foreground/90">{title}</h3>
        <span className="text-[10px] text-muted-foreground">{subtitle}</span>
      </div>
      {children}
    </div>
  );
}

export default SimulateView;