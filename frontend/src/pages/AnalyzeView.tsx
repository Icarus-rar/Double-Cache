import { useState } from 'react';
import { BarChart3, Database, FileSpreadsheet, Play, RefreshCw, Zap } from 'lucide-react';
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
      
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-teal-400" />
            <h1 className="text-lg font-semibold text-foreground">Storage Engine Telemetry Aggregation</h1>
          </div>
        </div>
        <Button
          onClick={runBenchmark}
          disabled={isLoading}
          className="h-9 gap-2 bg-teal-600 px-6 text-xs font-semibold hover:bg-teal-500"
        >
          {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {isLoading ? 'Executing...' : 'Run Live Benchmark'}
        </Button>
      </div>

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

          {/* Architectural Report Box */}
          <div className="mt-4 rounded-lg border border-teal-900/30 bg-teal-950/10 p-5 shadow-inner">
            <h3 className="mb-2 text-sm font-semibold text-teal-400">Execution Report & Analysis</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              This benchmark demonstrates the architectural difference between application-layer file parsing and 
              storage-engine indexing. The <strong>File System</strong> execution linearly parses a flat CSV trace (O(N) time complexity). 
              Conversely, the <strong>DBMS</strong> execution utilizes MySQL 8.4's B+ Tree composite indexes to aggregate telemetry. 
              This proves that utilizing proper relational indexing allows logarithmic (O(log N)) aggregation speeds while 
              strictly enforcing ACID consistency and automated trigger logging.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

export default AnalyzeView;