import { useMemo } from 'react';
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
} from 'lucide-react';
import {
  Strategy,
  WorkloadType,
  SimulationStatus,
  HitType,
} from '@/types';
import { useSimulation } from '@/hooks/useSimulation';
import { CacheVisualization } from '@/components/cache/CacheVisualization';
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
import { cn } from '@/lib/utils';

const WORKLOADS = Object.values(WorkloadType);
const STRATEGIES = Object.values(Strategy);

export function SimulateView() {
  const sim = useSimulation();
  const { state, config } = sim;
  const { metrics } = state;

  const chartData = useMemo(() => state.history, [state.history]);

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
          <span className="text-muted-foreground">Workload:</span>
          <span className="font-mono font-semibold text-foreground">{config.workload}</span>
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

      {/* Main Grid: Controls | Cache Viz | Metrics */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[260px_1fr_240px]">
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
                Workload
              </label>
              <Select
                value={config.workload}
                onValueChange={(v) => sim.updateConfig({ workload: v as WorkloadType })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORKLOADS.map((w) => (
                    <SelectItem key={w} value={w} className="text-xs">
                      {w}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-muted-foreground">
                Strategy
              </label>
              <Select
                value={config.strategy}
                onValueChange={(v) => sim.updateConfig({ strategy: v as Strategy })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STRATEGIES.map((s) => (
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
                  DB Cache Size
                </label>
                <span className="font-mono text-xs tabular-nums text-teal-400">
                  {config.dbCacheSize}
                </span>
              </div>
              <Slider
                value={[config.dbCacheSize]}
                min={4}
                max={32}
                step={4}
                onValueChange={(v) => sim.updateConfig({ dbCacheSize: v[0] })}
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <HardDrive className="h-3 w-3 text-amber-400" />
                  OS Cache Size
                </label>
                <span className="font-mono text-xs tabular-nums text-amber-400">
                  {config.osCacheSize}
                </span>
              </div>
              <Slider
                value={[config.osCacheSize]}
                min={4}
                max={32}
                step={4}
                onValueChange={(v) => sim.updateConfig({ osCacheSize: v[0] })}
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <Gauge className="h-3 w-3" />
                  Simulation Speed
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
                onValueChange={(v) => sim.updateConfig({ speed: v[0] })}
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
                max={2000}
                step={100}
                onValueChange={(v) => sim.updateConfig({ totalSteps: v[0] })}
              />
            </div>

            <div className="mt-2 flex flex-col gap-2">
              <Button
                onClick={sim.start}
                disabled={sim.isRunning || sim.isComplete}
                className="h-9 gap-1.5 bg-teal-600 text-xs font-semibold hover:bg-teal-500"
                size="sm"
              >
                <Play className="h-4 w-4" />
                {sim.isPaused ? 'Resume' : 'Start'}
              </Button>
              <div className="flex gap-2">
                <Button
                  onClick={sim.pause}
                  disabled={!sim.isRunning}
                  variant="outline"
                  className="h-9 flex-1 gap-1.5 text-xs"
                  size="sm"
                >
                  <Pause className="h-3.5 w-3.5" />
                  Pause
                </Button>
                <Button
                  onClick={sim.reset}
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

        {/* Center: Cache Visualization */}
        <div className="flex flex-col gap-3">
          <CacheVisualization
            dbBlocks={state.dbCache}
            osBlocks={state.osCache}
            dbCacheSize={config.dbCacheSize}
            osCacheSize={config.osCacheSize}
            duplicatedBlockIds={state.duplicatedBlockIds}
            currentBlockId={metrics.blockId}
          />
        </div>

        {/* Right: Metrics Panel */}
        <div className="glass-card rounded-lg p-4">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Metrics
            </h2>
          </div>

          {/* Current Operation */}
          <div className="mb-4 rounded-md border border-border/40 bg-muted/20 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              Current Operation
            </div>
            <div className="mb-2 flex items-center justify-between">
              <MetricStat label="Step" value={metrics.step} size="lg" color="default" />
              <HitTypeBadge hitType={metrics.hitType} size="sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MetricStat
                label="Block ID"
                value={metrics.blockId}
                size="sm"
                color="default"
                icon={<Zap className="h-2.5 w-2.5" />}
              />
              <MetricStat
                label="Latency"
                value={metrics.latencyMs.toFixed(2)}
                unit="ms"
                size="sm"
                color={metrics.latencyMs > 2 ? 'dup' : metrics.latencyMs > 0.5 ? 'os' : 'db'}
              />
            </div>
          </div>

          {/* Cumulative Stats */}
          <div className="flex flex-col gap-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Cumulative
            </div>
            <MetricStat
              label="DB Cache Hits"
              value={metrics.dbCacheHits}
              color="db"
              size="sm"
            />
            <MetricStat
              label="OS Cache Hits"
              value={metrics.osCacheHits}
              color="os"
              size="sm"
            />
            <MetricStat
              label="Disk Reads"
              value={metrics.diskReads}
              color="muted"
              size="sm"
            />
            <MetricStat
              label="DB Cache Misses"
              value={metrics.dbCacheMisses}
              color="muted"
              size="sm"
            />
            <MetricStat
              label="OS Cache Misses"
              value={metrics.osCacheMisses}
              color="muted"
              size="sm"
            />

            <div className="my-1 h-px bg-border/40" />

            <div className="rounded-md border border-red-500/20 bg-red-950/20 p-2.5">
              <MetricStat
                label="Duplicated Blocks"
                value={metrics.duplicatedBlocks}
                color="dup"
                size="md"
              />
              <div className="mt-2">
                <MetricStat
                  label="Duplication %"
                  value={metrics.duplicationPercent.toFixed(1)}
                  unit="%"
                  color="dup"
                  size="md"
                />
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted/50">
                  <div
                    className="h-full rounded-full bg-red-500 transition-all duration-500"
                    style={{
                      width: `${Math.min(100, metrics.duplicationPercent)}%`,
                      boxShadow: '0 0 8px rgba(239,68,68,0.5)',
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <MetricStat
                label="DB Hit Rate"
                value={(metrics.dbHitRate * 100).toFixed(1)}
                unit="%"
                color="db"
                size="sm"
              />
              <MetricStat
                label="OS Hit Rate"
                value={(metrics.osHitRate * 100).toFixed(1)}
                unit="%"
                color="os"
                size="sm"
              />
            </div>

            <MetricStat
              label="Est. Memory Waste"
              value={metrics.memoryWasteMb.toFixed(2)}
              unit="MB"
              color="dup"
              size="sm"
            />
          </div>
        </div>
      </div>

      {/* Bottom: Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <ChartCard title="Duplication %" subtitle="Over time">
          <DuplicationChart data={chartData} height={160} />
        </ChartCard>
        <ChartCard title="Latency" subtitle="ms over time">
          <LatencyChart data={chartData} height={160} />
        </ChartCard>
        <ChartCard title="Hit Rate" subtitle="DB vs OS">
          <HitRateChart data={chartData} height={160} />
        </ChartCard>
        <ChartCard title="Disk Reads" subtitle="Cumulative">
          <DiskReadsChart data={chartData} height={160} />
        </ChartCard>
      </div>

      {/* Timeline */}
      <Timeline
        currentStep={metrics.step}
        totalSteps={metrics.totalSteps}
        status={state.status}
      />
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
