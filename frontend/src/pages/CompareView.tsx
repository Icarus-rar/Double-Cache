import { useState, useEffect, useMemo, useCallback } from 'react';
import { GitCompare, Trophy, TrendingDown, Play, RefreshCw, AlertCircle } from 'lucide-react';
import { ComparisonRow, Strategy, WorkloadType, STRATEGY_COLORS } from '@/types';
import { ComparisonBarChart } from '@/charts/ComparisonBarChart';
import { LatencyComparisonChart } from '@/charts/LatencyComparisonChart';
import { StrategyBadge } from '@/components/shared/StrategyBadge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

const ACTIVE_WORKLOADS: WorkloadType[] = [
  WorkloadType.FLASH_SALE,
  WorkloadType.NETFLIX,
  WorkloadType.MULTI_TENANT,
];

const STRATEGY_MODES: { strategy: Strategy; backendMode: string }[] = [
  { strategy: Strategy.DOUBLE_CACHING, backendMode: 'DOUBLE_CACHING' },
  { strategy: Strategy.DIRECT_IO, backendMode: 'O_DIRECT' },
  { strategy: Strategy.COORDINATED, backendMode: 'COORDINATED' },
];

const METRICS: {
  key: keyof ComparisonRow;
  label: string;
  unit: string;
  lowerIsBetter: boolean;
  format: (v: number) => string;
}[] = [
  { key: 'avgLatencyMs', label: 'Avg Latency', unit: 'ms', lowerIsBetter: true, format: (v) => v.toFixed(2) },
  { key: 'p50LatencyMs', label: 'P50', unit: 'ms', lowerIsBetter: true, format: (v) => v.toFixed(2) },
  { key: 'p95LatencyMs', label: 'P95', unit: 'ms', lowerIsBetter: true, format: (v) => v.toFixed(2) },
  { key: 'p99LatencyMs', label: 'P99', unit: 'ms', lowerIsBetter: true, format: (v) => v.toFixed(2) },
  { key: 'dbHitRate', label: 'DB Hit Rate', unit: '%', lowerIsBetter: false, format: (v) => (v * 100).toFixed(1) },
  { key: 'osHitRate', label: 'OS Hit Rate', unit: '%', lowerIsBetter: false, format: (v) => (v * 100).toFixed(1) },
  { key: 'diskReads', label: 'Disk Reads', unit: '', lowerIsBetter: true, format: (v) => v.toFixed(0) },
  { key: 'duplicationPercent', label: 'Duplication', unit: '%', lowerIsBetter: true, format: (v) => v.toFixed(1) },
  { key: 'memoryWasteMb', label: 'Memory Waste', unit: 'MB', lowerIsBetter: true, format: (v) => v.toFixed(2) },
];

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

export function CompareView() {
  const [selectedWorkload, setSelectedWorkload] = useState<WorkloadType>(WorkloadType.FLASH_SALE);
  const [comparisonData, setComparisonData] = useState<ComparisonRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const runComparison = useCallback(async (workload: WorkloadType) => {
    setLoading(true);
    setError(null);

    let scenario = 'scenario1';
    if (workload === WorkloadType.NETFLIX) scenario = 'scenario2';
    if (workload === WorkloadType.MULTI_TENANT) scenario = 'scenario3';

    try {
      const results = await Promise.all(
        STRATEGY_MODES.map(async ({ strategy, backendMode }) => {
          const res = await fetch('http://127.0.0.1:8000/api/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scenario_name: scenario,
              db_cache_size: 16,
              os_cache_size: 16,
              coordination_mode: backendMode,
              replacement_policy: 'LRU',
              num_steps: 500,
              write_ratio: 0.2,
            }),
          });

          if (!res.ok) throw new Error(`HTTP ${res.status} on ${backendMode}`);
          const payload = await res.json();
          const telemetry: any[] = payload.telemetry ?? [];

          const latencies = telemetry.map((t) => Number(t.latency_ms)).sort((a, b) => a - b);
          const avgLatencyMs =
            latencies.length > 0 ? latencies.reduce((acc, v) => acc + v, 0) / latencies.length : 0;

          const last = telemetry[telemetry.length - 1] ?? {};
          const avgDupRate =
            telemetry.length > 0
              ? telemetry.reduce((acc, t) => acc + Number(t.duplication_rate), 0) / telemetry.length
              : 0;

          const duplicationPercent = avgDupRate * 100;
          // Estimated duplicated pages out of 16-page cache pool * 16 KB/page
          const memoryWasteMb = ((avgDupRate * 16) * 16) / 1024;

          return {
            strategy,
            avgLatencyMs,
            p50LatencyMs: percentile(latencies, 0.5),
            p95LatencyMs: percentile(latencies, 0.95),
            p99LatencyMs: percentile(latencies, 0.99),
            dbHitRate: Number(last.db_cache_hit_ratio ?? 0),
            osHitRate: Number(last.os_cache_hit_ratio ?? 0),
            diskReads: Number(last.cumulative_disk_reads ?? 0),
            duplicationPercent,
            memoryWasteMb,
          } satisfies ComparisonRow;
        })
      );

      setComparisonData(results);
    } catch (err: any) {
      setError(err.message ?? 'Failed to run benchmark comparison');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runComparison(selectedWorkload);
  }, [selectedWorkload, runComparison]);

  const bestPerMetric = useMemo(() => {
    const best: Partial<Record<keyof ComparisonRow, Strategy>> = {};
    for (const metric of METRICS) {
      const sorted = [...comparisonData].sort((a, b) => {
        const va = a[metric.key] as number;
        const vb = b[metric.key] as number;
        return metric.lowerIsBetter ? va - vb : vb - va;
      });
      best[metric.key] = sorted[0]?.strategy;
    }
    return best;
  }, [comparisonData]);

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <GitCompare className="h-5 w-5 text-teal-400" />
          <h1 className="text-lg font-semibold text-foreground">Live Strategy Comparison</h1>
        </div>
        <div className="h-5 w-px bg-border/60" />
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Workload:</label>
          <Select
            value={selectedWorkload}
            onValueChange={(v) => setSelectedWorkload(v as WorkloadType)}
            disabled={loading}
          >
            <SelectTrigger className="h-8 w-44 text-xs">
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
        </div>

        <Button
          onClick={() => runComparison(selectedWorkload)}
          disabled={loading}
          size="sm"
          className="ml-auto h-8 gap-1.5 bg-teal-600 text-xs font-semibold hover:bg-teal-500"
        >
          {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {loading ? 'Benchmarking...' : 'Re-Run All 3 Strategies'}
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-950/30 px-4 py-2.5 text-xs text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error} — Ensure FastAPI is running on 127.0.0.1:8000.</span>
        </div>
      )}

      {/* Comparison Table */}
      <div className="glass-card overflow-hidden rounded-lg">
        <div className="border-b border-border/40 px-4 py-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Live Telemetry Matrix — {selectedWorkload} (500 Steps, 16 DB / 16 OS Pages)
          </h2>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <Table>
            <TableHeader>
              <TableRow className="border-border/40 hover:bg-transparent">
                <TableHead className="h-9 text-[11px] uppercase tracking-wider text-muted-foreground">
                  Strategy
                </TableHead>
                {METRICS.map((m) => (
                  <TableHead
                    key={m.key}
                    className="h-9 text-right text-[11px] uppercase tracking-wider text-muted-foreground"
                  >
                    {m.label}
                    {m.unit && <span className="ml-0.5 text-muted-foreground/50">({m.unit})</span>}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparisonData.map((row) => (
                <TableRow
                  key={row.strategy}
                  className="border-border/30 transition-colors hover:bg-muted/20"
                >
                  <TableCell className="py-2.5">
                    <StrategyBadge strategy={row.strategy} size="sm" />
                  </TableCell>
                  {METRICS.map((m) => {
                    const value = row[m.key] as number;
                    const isBest = bestPerMetric[m.key] === row.strategy;
                    return (
                      <TableCell
                        key={m.key}
                        className={cn(
                          'py-2.5 text-right font-mono text-xs tabular-nums transition-colors',
                          isBest && 'text-green-400'
                        )}
                      >
                        <span className="relative inline-flex items-center gap-1">
                          {isBest && <Trophy className="h-2.5 w-2.5 text-green-400/80" />}
                          {m.format(value)}
                        </span>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Charts Grid */}
      {comparisonData.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="glass-card rounded-lg p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Latency Percentiles (Avg, P50, P95, P99)
              </h3>
              <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <LatencyComparisonChart data={comparisonData} height={240} />
          </div>

          <div className="glass-card rounded-lg p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cross-Layer Duplication %
              </h3>
              <TrendingDown className="h-3.5 w-3.5 text-red-400" />
            </div>
            <ComparisonBarChart
              data={comparisonData}
              metric="duplicationPercent"
              label="Duplication"
              unit="%"
              height={240}
              lowerIsBetter={true}
            />
          </div>

          <div className="glass-card rounded-lg p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Wasted RAM (MB)
              </h3>
              <TrendingDown className="h-3.5 w-3.5 text-red-400" />
            </div>
            <ComparisonBarChart
              data={comparisonData}
              metric="memoryWasteMb"
              label="Memory Waste"
              unit=" MB"
              height={240}
              lowerIsBetter={true}
            />
          </div>

          <div className="glass-card rounded-lg p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Physical Disk Reads
              </h3>
              <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <ComparisonBarChart
              data={comparisonData}
              metric="diskReads"
              label="Disk Reads"
              height={240}
              lowerIsBetter={true}
            />
          </div>
        </div>
      )}

      {/* Strategy Summary Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {comparisonData.map((row) => {
          const color = STRATEGY_COLORS[row.strategy];
          return (
            <div
              key={row.strategy}
              className="glass-card rounded-lg p-3 transition-all duration-300 hover:border-border/80"
              style={{ borderLeft: `2px solid ${color}` }}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold" style={{ color }}>
                  {row.strategy}
                </span>
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}80` }}
                />
              </div>
              <div className="flex flex-col gap-1 font-mono text-[11px] text-muted-foreground">
                <div className="flex justify-between">
                  <span>Avg Latency</span>
                  <span className="tabular-nums text-foreground/80">{row.avgLatencyMs.toFixed(2)}ms</span>
                </div>
                <div className="flex justify-between">
                  <span>Duplication</span>
                  <span
                    className={cn(
                      'tabular-nums',
                      row.duplicationPercent > 15
                        ? 'text-red-400'
                        : row.duplicationPercent > 0
                          ? 'text-amber-400'
                          : 'text-green-400'
                    )}
                  >
                    {row.duplicationPercent.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Memory Waste</span>
                  <span
                    className={cn(
                      'tabular-nums',
                      row.memoryWasteMb > 0.1
                        ? 'text-red-400'
                        : row.memoryWasteMb > 0
                          ? 'text-amber-400'
                          : 'text-green-400'
                    )}
                  >
                    {row.memoryWasteMb.toFixed(2)}MB
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>DB Hit Rate</span>
                  <span className="tabular-nums text-teal-400">{(row.dbHitRate * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CompareView;