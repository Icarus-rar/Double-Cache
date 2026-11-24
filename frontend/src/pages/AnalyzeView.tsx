import { useState } from 'react';
import { BarChart3, Database, FileSpreadsheet, Play, Loader2, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface EngineMetrics {
  rows_scanned: number;
  avg_latency_ms: number;
  avg_duplication_rate: number;
  max_disk_reads: number;
}

interface BenchmarkResponse {
  status: string;
  benchmark: {
    csv_time_ms: number;
    dbms_time_ms: number;
    speedup_factor: string;
    faster_engine: string;
  };
  csv_metrics: EngineMetrics;
  dbms_metrics: EngineMetrics;
}

export function AnalyzeView() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<BenchmarkResponse | null>(null);

  const runBenchmark = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('http://127.0.0.1:8000/api/benchmark/file-vs-dbms');
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${response.status}`);
      }
      const data: BenchmarkResponse = await response.json();
      setResult(data);
      toast({
        title: 'Benchmark Complete',
        description: `Winner: ${data.benchmark.faster_engine} (${data.benchmark.speedup_factor} speedup)`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Benchmark Failed',
        description: error.message || 'Could not reach /api/benchmark/file-vs-dbms',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl font-bold">
              <BarChart3 className="h-5 w-5 text-teal-400" />
              File System vs. MySQL 8.4 Relational Benchmark
            </CardTitle>
            <CardDescription>
              Compares sequential flat-file CSV scanning against B+ Tree indexed SQL aggregation (DBMS Unit 1 & Unit 3).
            </CardDescription>
          </div>
          <Button onClick={runBenchmark} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" /> Run Live Benchmark
              </>
            )}
          </Button>
        </CardHeader>
      </Card>

      {result && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Flat File (CSV) Execution</CardDescription>
                <CardTitle className="text-2xl font-mono">{result.benchmark.csv_time_ms} ms</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {result.csv_metrics.rows_scanned} rows parsed sequentially via Python I/O
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>MySQL 8.4 Indexed Query</CardDescription>
                <CardTitle className="text-2xl font-mono text-teal-400">
                  {result.benchmark.dbms_time_ms} ms
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {result.dbms_metrics.rows_scanned} rows aggregated via composite index
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Engine Comparison</CardDescription>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Zap className="h-5 w-5 text-amber-400" />
                  {result.benchmark.speedup_factor}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant="outline">{result.benchmark.faster_engine}</Badge>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                  File System Telemetry Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg Access Latency:</span>
                  <span>{result.csv_metrics.avg_latency_ms} ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg Duplication Rate:</span>
                  <span>{(result.csv_metrics.avg_duplication_rate * 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max Cumulative Disk Reads:</span>
                  <span>{result.csv_metrics.max_disk_reads}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="h-4 w-4 text-teal-400" />
                  MySQL 8.4 Telemetry Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg Access Latency:</span>
                  <span>{result.dbms_metrics.avg_latency_ms} ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg Duplication Rate:</span>
                  <span>{(result.dbms_metrics.avg_duplication_rate * 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max Cumulative Disk Reads:</span>
                  <span>{result.dbms_metrics.max_disk_reads}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

export default AnalyzeView;