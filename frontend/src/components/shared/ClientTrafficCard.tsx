import { ShoppingBag, Film, Server, Activity } from 'lucide-react';
import { WorkloadType } from '@/types';
import { cn } from '@/lib/utils';

interface ClientTrafficCardProps {
  workload: WorkloadType;
  currentStep: number;
  currentPageId: number;
  currentOp: 'READ' | 'WRITE' | string;
  isRunning: boolean;
}

const FLASH_PRODUCTS = [
  'iPhone 16 Pro Max (256GB)',
  'PlayStation 5 Slim Disc',
  'Sony WH-1000XM5 ANC',
  'MacBook Air M3 (16GB)',
  'Samsung Odyssey OLED G8',
];

export function ClientTrafficCard({
  workload,
  currentStep,
  currentPageId,
  currentOp,
  isRunning,
}: ClientTrafficCardProps) {
  const isFlashSale = workload === WorkloadType.FLASH_SALE;
  const isNetflix = workload === WorkloadType.NETFLIX;

  // Derive realistic domain context from current page_id
  const isHotProduct = currentPageId <= 19;
  const productName = FLASH_PRODUCTS[currentPageId % FLASH_PRODUCTS.length];

  const isMetadataPage = currentPageId <= 5;
  const streamPercent = Math.min(100, Math.round((currentStep / 500) * 100));

  const isNoisyNeighbor = currentPageId >= 200;

  return (
    <div className="glass-card rounded-lg p-3.5 mt-2 mb-2">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isFlashSale && <ShoppingBag className="h-4 w-4 text-teal-400" />}
          {isNetflix && <Film className="h-4 w-4 text-amber-400" />}
          {!isFlashSale && !isNetflix && <Server className="h-4 w-4 text-blue-400" />}
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Simulated Client Workload Trace
          </span>
        </div>
        <span
          className={cn(
            'flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px]',
            isRunning ? 'bg-teal-500/15 text-teal-400' : 'bg-muted text-muted-foreground'
          )}
        >
          <Activity className="h-3 w-3" />
          {isRunning ? 'LIVE STREAM' : 'READY'}
        </span>
      </div>

      {/* SCENARIO 1: AMAZON / FLIPKART FLASH SALE */}
      {isFlashSale && (
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between rounded border border-border/50 bg-black/30 px-2.5 py-1.5">
            <div>
              <div className="font-semibold text-foreground">
                {isHotProduct ? `🔥 HOT SKU: ${productName}` : `Catalog Browse (Page #${currentPageId})`}
              </div>
              <div className="font-mono text-[10px] text-muted-foreground">
                {currentOp === 'WRITE'
                  ? `POST /checkout/reserve-stock → InnoDB Page #${currentPageId}`
                  : `GET /product/inventory-check → InnoDB Page #${currentPageId}`}
              </div>
            </div>
            <span
              className={cn(
                'rounded px-2 py-0.5 font-mono text-[10px] font-bold',
                isHotProduct ? 'bg-red-500/20 text-red-400' : 'bg-slate-500/20 text-slate-300'
              )}
            >
              {isHotProduct ? 'ZIPFIAN HOT' : 'LONG TAIL'}
            </span>
          </div>
        </div>
      )}

      {/* SCENARIO 2: NETFLIX 4K STREAMING */}
      {isNetflix && (
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between rounded border border-border/50 bg-black/30 px-2.5 py-1.5">
            <div>
              <div className="font-semibold text-foreground">
                {isMetadataPage
                  ? `👤 User Profile & Watchlist Index (Page #${currentPageId})`
                  : `🎬 4K HDR Video Chunk #${currentPageId}.m4s`}
              </div>
              <div className="font-mono text-[10px] text-muted-foreground">
                {isMetadataPage
                  ? 'Random Lookup — Needs to stay warm in RAM'
                  : 'Sequential Stream — One-time read (POSIX_FADV_DONTNEED candidate)'}
              </div>
            </div>
            <span
              className={cn(
                'rounded px-2 py-0.5 font-mono text-[10px] font-bold',
                isMetadataPage ? 'bg-teal-500/20 text-teal-400' : 'bg-amber-500/20 text-amber-400'
              )}
            >
              {isMetadataPage ? 'HOT META' : 'SEQ CHUNK'}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/40">
            <div
              className="h-full bg-amber-400 transition-all duration-150"
              style={{ width: `${streamPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* SCENARIO 3: MULTI-TENANT CLOUD HYPERVISOR */}
      {!isFlashSale && !isNetflix && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div
            className={cn(
              'rounded border px-2.5 py-1.5 transition-colors',
              !isNoisyNeighbor
                ? 'border-teal-500/50 bg-teal-950/20'
                : 'border-border/40 bg-black/20 opacity-60'
            )}
          >
            <div className="font-semibold text-teal-400">Tenant A (FinTech DB)</div>
            <div className="font-mono text-[10px] text-muted-foreground">
              {!isNoisyNeighbor ? `Active OLTP → Page #${currentPageId}` : 'Working Set: Pages 10–22'}
            </div>
          </div>

          <div
            className={cn(
              'rounded border px-2.5 py-1.5 transition-colors',
              isNoisyNeighbor
                ? 'border-red-500/50 bg-red-950/20'
                : 'border-border/40 bg-black/20 opacity-60'
            )}
          >
            <div className="font-semibold text-red-400">Tenant B (Backup VM)</div>
            <div className="font-mono text-[10px] text-muted-foreground">
              {isNoisyNeighbor ? `⚠️ Bulk Scan → Page #${currentPageId}` : 'Idle / Waiting for Snapshot'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}