const API_BASE_URL = 'http://127.0.0.1:8000';

export interface SimulationRequest {
  workload: 'sequential' | 'random' | 'hotspot';
  num_accesses: number;
  db_cache_size: number;
  os_cache_size: number;
  total_blocks: number;
  cache_mode: 'double_caching' | 'coordinated';
}

export interface SimulationHistoryItem {
  step: number;
  block_id: number;
  hit_type: 'db_hit' | 'os_hit' | 'disk_read';
  latency_ms: number;
  db_cache_size: number;
  os_cache_size: number;
  duplicated_blocks: number;
  memory_wasted_kb: number;
  cache_mode: string;
  db_blocks: number[];
  os_blocks: number[];
  duplicated_block_ids: number[];
}

export interface SimulationResponse {
  workload: string;
  cache_mode: string;
  summary: {
    total_steps: number;
    db_hits: number;
    os_hits: number;
    disk_reads: number;
    avg_latency_ms: number;
    max_duplication: number;
    avg_wasted_memory_kb: number;
  } | null;
  history: SimulationHistoryItem[];
  final_db_blocks: number[];
  final_os_blocks: number[];
}

export async function runRealSimulation(
  request: SimulationRequest,
): Promise<SimulationResponse> {
  const response = await fetch(`${API_BASE_URL}/simulate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Simulation API failed: HTTP ${response.status}`);
  }

  return response.json() as Promise<SimulationResponse>;
}