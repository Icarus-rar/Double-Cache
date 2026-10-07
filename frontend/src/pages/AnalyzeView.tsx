import { useState, useMemo } from 'react';
import { BarChart3, History, Clock, Filter } from 'lucide-react';
import { RunSummary, Strategy, WorkloadType, STRATEGY_COLORS } from '@/types';
import { getSimulationService } from '@/services/simulationService';
import { DuplicationChart } from '@/charts/DuplicationChart';
import { LatencyChart } from '@/charts/LatencyChart';
import { HitRateChart } from '@/charts/HitRateChart';
import { DiskReadsChart } from '@/charts/DiskReadsChart';
import { StrategyBadge } from '@/components/shared/StrategyBadge';
import { MetricStat } from '@/components/shared/MetricStat';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

const WORKLOADS = Object.values(WorkloadType);
const STRATEGIES = Object.values(Strategy);

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function AnalyzeView() {
  const service = useMemo(() => getSimulationService(), []);
  const allRuns = useMemo(() => service.getRuns(), [service]);

  const [selectedRunId, setSelectedRunId] = useState<string>(allRuns[0]?.id ?? '');
  const [filterWorkload, setFilterWorkload] = useState<WorkloadType | 'all'>('all');
  const [filterStrategy, setFilterStrategy] = useState<Strategy | 'all'>('all');

  const filteredRuns = useMemo(() => {
    return allRuns.filter((r) => {
      if (filterWorkload !== 'all' && r.workload !== filterWorkload) return false;
      if (filterStrategy !== 'all' && r.strategy !== filterStrategy) return false;
      return true;
    });
  }, [allRuns, filterWorkload, filterStrategy]);

  const selectedRun = useMemo(
    () => allRuns.find((r) => r.id === selectedRunId) ?? filteredRuns[0] ?? allRuns[0],
    [allRuns, selectedRunId, filteredRuns],
  );

  if (!selectedRun) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        No runs available.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-teal-400" />
          <h1 className="text-lg font-semibold text-foreground">Historical Analysis</h1>
        </div>
        <div className="h-5 w-px bg-border/60" />
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={filterWorkload} onValueChange={(v) => setFilterWorkload(v as WorkloadType | 'all')}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Workloads</SelectItem>
              {WORKLOADS.map((w) => (
                <SelectItem key={w} value={w} className="text-xs">{w}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStrategy} onValueChange={(v) => setFilterStrategy(v as Strategy | 'all')}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Strategies</SelectItem>
              {STRATEGIES.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <History className="h-3.5 w-3.5" />
          <span className="font-mono tabular-nums">{filteredRuns.length} runs</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        {/* Left: Selected Run Details + Charts */}
        <div className="flex flex-col gap-4">
          {/* Run Summary Card */}
          <div className="glass-card rounded-lg p-4">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="font-mono text-sm font-semibold text-foreground">
                {selectedRun.id.toUpperCase()}
              </h2>
              <StrategyBadge strategy={selectedRun.strategy} size="sm" />
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="rounded-md border border-border/40 bg-muted/30 px-1.5 py-0.5 font-mono">
                  {selectedRun.workload}
                </span>
              </div>
              <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span className="font-mono">{formatDate(selectedRun.date)}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 sm:grid-cols-5 lg:grid-cols-9">
              <MetricStat label="Steps" value={selectedRun.totalSteps.toLocaleString()} size="sm" />
              <MetricStat label="Avg Lat" value={selectedRun.avgLatencyMs.toFixed(2)} unit="ms" size="sm" color="os" />
              <MetricStat label="P50" value={selectedRun.p50LatencyMs.toFixed(2)} unit="ms" size="sm" />
              <MetricStat label="P95" value={selectedRun.p95LatencyMs.toFixed(2)} unit="ms" size="sm" color="os" />
              <MetricStat label="P99" value={selectedRun.p99LatencyMs.toFixed(2)} unit="ms" size="sm" color="dup" />
              <MetricStat label="DB Hit" value={(selectedRun.dbHitRate * 100).toFixed(1)} unit="%" size="sm" color="db" />
              <MetricStat label="OS Hit" value={(selectedRun.osHitRate * 100).toFixed(1)} unit="%" size="sm" color="os" />
              <MetricStat
                label="Dup %"
                value={selectedRun.duplicationPercent.toFixed(1)}
                unit="%"
                size="sm"
                color={selectedRun.duplicationPercent > 15 ? 'dup' : selectedRun.duplicationPercent > 0 ? 'os' : 'ok'}
              />
              <MetricStat
                label="Waste"
                value={selectedRun.memoryWasteMb.toFixed(2)}
                unit="MB"
                size="sm"
                color={selectedRun.memoryWasteMb > 1 ? 'dup' : selectedRun.memoryWasteMb > 0.1 ? 'os' : 'ok'}
              />
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="glass-card rounded-lg p-3">
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-xs font-semibold text-foreground/90">Latency Over Time</h3>
                <span className="text-[10px] text-muted-foreground">ms per step</span>
              </div>
              <LatencyChart data={selectedRun.history} height={180} />
            </div>
            <div className="glass-card rounded-lg p-3">
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-xs font-semibold text-foreground/90">Duplication %</h3>
                <span className="text-[10px] text-muted-foreground">over time</span>
              </div>
              <DuplicationChart data={selectedRun.history} height={180} />
            </div>
            <div className="glass-card rounded-lg p-3">
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-xs font-semibold text-foreground/90">Hit Rate Breakdown</h3>
                <span className="text-[10px] text-muted-foreground">DB vs OS</span>
              </div>
              <HitRateChart data={selectedRun.history} height={180} />
            </div>
            <div className="glass-card rounded-lg p-3">
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-xs font-semibold text-foreground/90">Disk Reads</h3>
                <span className="text-[10px] text-muted-foreground">cumulative</span>
              </div>
              <DiskReadsChart data={selectedRun.history} height={180} />
            </div>
          </div>
        </div>

        {/* Right: Run List */}
        <div className="glass-card flex flex-col overflow-hidden rounded-lg">
          <div className="border-b border-border/40 px-3 py-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Simulation Runs
            </h3>
          </div>
          <div className="max-h-[700px] overflow-y-auto scrollbar-thin">
            <Table>
              <TableHeader>
                <TableRow className="border-border/40 hover:bg-transparent">
                  <TableHead className="h-8 text-[10px] uppercase tracking-wider text-muted-foreground">Run</TableHead>
                  <TableHead className="h-8 text-[10px] uppercase tracking-wider text-muted-foreground">Strategy</TableHead>
                  <TableHead className="h-8 text-right text-[10px] uppercase tracking-wider text-muted-foreground">Dup%</TableHead>
                  <TableHead className="h-8 text-right text-[10px] uppercase tracking-wider text-muted-foreground">Lat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRuns.map((run) => (
                  <TableRow
                    key={run.id}
                    onClick={() => setSelectedRunId(run.id)}
                    className={cn(
                      'cursor-pointer border-border/30 transition-colors',
                      run.id === selectedRun.id ? 'bg-muted/40' : 'hover:bg-muted/20',
                    )}
                  >
                    <TableCell className="py-2">
                      <div className="flex flex-col">
                        <span className="font-mono text-[11px] font-semibold text-foreground/80">
                          {run.id.toUpperCase()}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{run.workload}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{
                          backgroundColor: STRATEGY_COLORS[run.strategy],
                          boxShadow: `0 0 4px ${STRATEGY_COLORS[run.strategy]}80`,
                        }}
                      />
                    </TableCell>
                    <TableCell className="py-2 text-right font-mono text-[11px] tabular-nums">
                      <span
                        className={cn(
                          run.duplicationPercent > 15 ? 'text-red-400' : run.duplicationPercent > 0 ? 'text-amber-400' : 'text-green-400',
                        )}
                      >
                        {run.duplicationPercent.toFixed(0)}%
                      </span>
                    </TableCell>
                    <TableCell className="py-2 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                      {run.avgLatencyMs.toFixed(1)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
