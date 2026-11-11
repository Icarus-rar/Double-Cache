import { useState } from 'react';
import { runRealSimulation, type SimulationResponse } from './services/simulationApi';

export default function ApiTest() {
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function testApi() {
    setLoading(true);
    setError('');

    try {
      const data = await runRealSimulation({
        workload: 'sequential',
        num_accesses: 10,
        db_cache_size: 4,
        os_cache_size: 4,
        total_blocks: 1000,
        cache_mode: 'coordinated',
      });

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: 'monospace' }}>
      <h1>Memory Mirage API Test</h1>
      <button onClick={testApi} disabled={loading}>
        {loading ? 'Running simulation...' : 'Run real simulation'}
      </button>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {result && (
        <pre style={{ whiteSpace: 'pre-wrap', marginTop: 20 }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  );
}