import { useState } from 'react';
import { Layers, GitCompare, BarChart3, ArrowRight } from 'lucide-react';
import { SimulateView } from '@/pages/SimulateView';
import { CompareView } from '@/pages/CompareView';
import { AnalyzeView } from '@/pages/AnalyzeView';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import './App.css';

type View = 'simulate' | 'compare' | 'analyze';

const NAV_ITEMS: { id: View; label: string; icon: typeof Layers }[] = [
  { id: 'simulate', label: 'Simulate', icon: Layers },
  { id: 'compare', label: 'Compare', icon: GitCompare },
  { id: 'analyze', label: 'Analyze', icon: BarChart3 },
];

function App() {
  const [hasEntered, setHasEntered] = useState(false);
  const [view, setView] = useState<View>('simulate');

  // --- THE LANDING PAGE ---
  if (!hasEntered) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background p-6">
        {/* Massive Ambient Background Glows for Landing Page */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[800px] rounded-full bg-teal-600/10 opacity-70 blur-[120px]" />
        <div className="pointer-events-none absolute left-1/4 top-1/4 h-[400px] w-[400px] rounded-full bg-blue-600/10 opacity-50 blur-[100px]" />

        <div className="z-10 flex max-w-4xl flex-col items-center text-center animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 shadow-2xl shadow-teal-500/30">
            <Layers className="h-10 w-10 text-white" />
          </div>
          
          <h1 className="mb-4 text-5xl font-extrabold tracking-tight text-white sm:text-7xl">
            MEMORY MIRAGE
          </h1>
          
          <p className="mb-8 max-w-2xl text-lg text-muted-foreground sm:text-xl">
            Solving "Phantom Capacity" and Double Caching between Operating Systems and Database Management Systems under real-world workloads.
          </p>

          <Button 
            onClick={() => setHasEntered(true)} 
            className="group h-12 rounded-full bg-teal-600 px-8 text-base font-bold text-white shadow-[0_0_20px_rgba(13,148,136,0.4)] transition-all hover:scale-105 hover:bg-teal-500 hover:shadow-[0_0_30px_rgba(13,148,136,0.6)]"
          >
            Launch Simulation Hub
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Button>

          <div className="mt-16 flex gap-6 text-sm font-medium text-muted-foreground/60">
            <span>Powered by MySQL 8.4</span>
            <span>•</span>
            <span>FastAPI</span>
            <span>•</span>
            <span>React</span>
          </div>
        </div>
      </div>
    );
  }

  // --- THE MAIN DASHBOARD ---
  return (
    <div className="relative min-h-screen bg-transparent text-foreground animate-in fade-in duration-700">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/40 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center px-6">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-teal-700 shadow-lg shadow-teal-500/20">
              <Layers className="h-4 w-4 text-white" />
            </div>
            <div className="flex flex-col leading-none">
              <h1 className="text-[13px] font-bold tracking-wide text-foreground uppercase">
                Memory Mirage
              </h1>
              <span className="text-[10px] font-medium text-muted-foreground">
                OS & DBMS Engine
              </span>
            </div>
          </div>

          {/* Nav Tabs */}
          <nav className="mx-auto flex items-center gap-1.5 rounded-lg border border-border/40 bg-black/20 p-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-4 py-1.5 text-[13px] font-semibold transition-all duration-300',
                    active
                      ? 'bg-teal-500/15 text-teal-400 shadow-sm'
                      : 'text-muted-foreground hover:bg-white/5 hover:text-foreground/90'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Live Stack Status */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-md border border-border/40 bg-black/20 px-3 py-1.5">
              <div className="h-2 w-2 animate-pulse rounded-full bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.6)]" />
              <span className="font-mono text-[10px] font-bold text-muted-foreground">
                MYSQL 8.4 CONNECTED
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* View Content */}
      <main className="mx-auto max-w-[1600px] animate-in slide-in-from-bottom-4 duration-500" key={view}>
        {view === 'simulate' && <SimulateView />}
        {view === 'compare' && <CompareView />}
        {view === 'analyze' && <AnalyzeView />}
      </main>
    </div>
  );
}

export default App;