import React, { useState } from "react";
import { Play, RotateCcw, AlertTriangle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { LatencyChart } from "@/charts/LatencyChart";
import { HitRateChart } from "@/charts/HitRateChart";
import { DuplicationChart } from "@/charts/DuplicationChart";
import { DiskReadsChart } from "@/charts/DiskReadsChart";
import { MetricStat } from "@/components/shared/MetricStat";
import { useToast } from "@/hooks/use-toast";

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

interface SimulationSummary {
  total_steps: number;
  db_hits: number;
  os_hits: number;
  disk_hits: number;
  cumulative_disk_reads: number;
  avg_latency_ms: number;
  avg_duplication_rate: number;
  total_thrashing_events: number;
}

export const SimulateView: React.FC = () => {
  const { toast } = useToast();

  const [scenarioName, setScenarioName] = useState<string>("scenario1");
  const [coordinationMode, setCoordinationMode] = useState<string>("DOUBLE_CACHING");
  const [replacementPolicy, setReplacementPolicy] = useState<string>("LRU");
  const [numSteps, setNumSteps] = useState<number>(1000);
  const [dbCacheSize] = useState<number>(50);
  const [osCacheSize] = useState<number>(50);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [telemetry, setTelemetry] = useState<TelemetryPoint[]>([]);
  const [summary, setSummary] = useState<SimulationSummary | null>(null);

  const handleRunSimulation = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("http://localhost:8000/api/simulate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scenario_name: scenarioName,
          db_cache_size: dbCacheSize,
          os_cache_size: osCacheSize,
          coordination_mode: coordinationMode,
          replacement_policy: replacementPolicy,
          num_steps: numSteps,
          write_ratio: 0.2,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server returned error status ${response.status}`);
      }

      const data = await response.json();
      setTelemetry(data.telemetry || []);
      setSummary(data.summary || null);

      toast({
        title: "Simulation Completed",
        description: `Executed ${data.summary?.total_steps ?? numSteps} steps using ${coordinationMode} (${replacementPolicy}).`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Simulation Failed",
        description: error.message || "Failed to communicate with FastAPI simulator.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setTelemetry([]);
    setSummary(null);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold">Simulator Controls</CardTitle>
              <CardDescription>
                Configure the dual-layer memory hierarchy and run the live workload simulator.
              </CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant={coordinationMode === "COORDINATED" ? "default" : "secondary"}>
                {coordinationMode}
              </Badge>
              <Badge variant="outline">{replacementPolicy}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-muted-foreground">Scenario</label>
              <Select value={scenarioName} onValueChange={setScenarioName} disabled={isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Scenario" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scenario1">Scenario 1 (Hot-spot Zipfian)</SelectItem>
                  <SelectItem value="scenario2">Scenario 2 (Sequential Thrashing)</SelectItem>
                  <SelectItem value="scenario3">Scenario 3 (Mixed Concurrency)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-muted-foreground">Coordination Mode</label>
              <Select value={coordinationMode} onValueChange={setCoordinationMode} disabled={isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DOUBLE_CACHING">DOUBLE_CACHING (Default)</SelectItem>
                  <SelectItem value="O_DIRECT">O_DIRECT (Bypass OS Cache)</SelectItem>
                  <SelectItem value="COORDINATED">COORDINATED (posix_fadvise)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-muted-foreground">Replacement Policy</label>
              <Select value={replacementPolicy} onValueChange={setReplacementPolicy} disabled={isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Policy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LRU">LRU (Least Recently Used)</SelectItem>
                  <SelectItem value="LFU">LFU (Least Frequently Used)</SelectItem>
                  <SelectItem value="FIFO">FIFO (First-In, First-Out)</SelectItem>
                  <SelectItem value="OPTIMAL">OPTIMAL (Belady's Lookahead)</SelectItem>
                  <SelectItem value="CLOCK">CLOCK (Second-Chance)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-muted-foreground">Workload Steps</label>
              <Select
                value={String(numSteps)}
                onValueChange={(val) => setNumSteps(Number(val))}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Number of Steps" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="200">200 Steps</SelectItem>
                  <SelectItem value="500">500 Steps</SelectItem>
                  <SelectItem value="1000">1,000 Steps</SelectItem>
                  <SelectItem value="2000">2,000 Steps</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end space-x-3">
            <Button variant="outline" onClick={handleReset} disabled={isLoading || telemetry.length === 0}>
              <RotateCcw className="mr-2 h-4 w-4" /> Reset
            </Button>
            <Button onClick={handleRunSimulation} disabled={isLoading} className="min-w-[140px]">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Simulating...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" /> Run Simulation
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricStat
            title="Avg Latency"
            value={`${summary.avg_latency_ms.toFixed(3)} ms`}
            description="Per-step memory access latency"
          />
          <MetricStat
            title="Duplication Rate"
            value={`${(summary.avg_duplication_rate * 100).toFixed(1)}%`}
            description="Intersection of DBMS & OS resident pages"
          />
          <MetricStat
            title="Cumulative Disk Reads"
            value={summary.cumulative_disk_reads.toString()}
            description="Physical storage fetches incurred"
          />
          <MetricStat
            title="Thrashing Events"
            value={summary.total_thrashing_events.toString()}
            description="High duplication + disk hit spikes"
            alert={summary.total_thrashing_events > 0}
          />
        </div>
      )}

      {summary && summary.total_thrashing_events > 0 && (
        <div className="flex items-center space-x-2 p-4 rounded-lg bg-destructive/15 text-destructive border border-destructive/30">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div className="text-sm">
            <span className="font-semibold">Memory Thrashing Detected:</span> {summary.total_thrashing_events} steps
            suffered severe cache evictions and page faults while memory duplication remained elevated.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Access Latency Over Time</CardTitle>
            <CardDescription>Per-step execution duration (ms)</CardDescription>
          </CardHeader>
          <CardContent>
            <LatencyChart data={telemetry} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Dual-Layer Hit Rate</CardTitle>
            <CardDescription>DBMS Buffer Pool vs. OS Page Cache ratios</CardDescription>
          </CardHeader>
          <CardContent>
            <HitRateChart data={telemetry} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Memory Duplication Rate</CardTitle>
            <CardDescription>Fraction of redundant pages residing in both layers</CardDescription>
          </CardHeader>
          <CardContent>
            <DuplicationChart data={telemetry} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Cumulative Disk Reads</CardTitle>
            <CardDescription>Total physical I/O operations demanded from storage</CardDescription>
          </CardHeader>
          <CardContent>
            <DiskReadsChart data={telemetry} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SimulateView;