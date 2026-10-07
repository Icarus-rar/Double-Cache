import { useState } from 'react';
import { Layers, GitCompare, BarChart3 } from 'lucide-react';
import { SimulateView } from '@/pages/SimulateView';
import { CompareView } from '@/pages/CompareView';
import { AnalyzeView } from '@/pages/AnalyzeView';
import { cn } from '@/lib/utils';
import './App.css';

type View = 'simulate' | 'compare' | 'analyze';

const NAV_ITEMS: { id: View; label: string; icon: typeof Layers }[] = [
  { id: 'simulate', label: 'Simulate', icon: Layers },
  { id: 'compare', label: 'Compare', icon: GitCompare },
  { id: 'analyze', label: 'Analyze', icon: BarChart3 },
];

function App() {
  const [view, setView] = useState<View>('simulate');

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-card/80 backdrop-blur-lg">
        <div className="mx-auto flex h-12 max-w-[1600px] items-center px-4">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-teal-500 to-teal-700 shadow-lg shadow-teal-500/20">
              <Layers className="h-4 w-4 text-white" />
            </div>
            <div className="flex flex-col leading-none">
              <h1 className="text-sm font-bold tracking-tight text-foreground">
                MEMORY MIRAGE
              </h1>
              <span className="text-[10px] text-muted-foreground">
                Chasing Phantom Capacity in OS & DBMS
              </span>
            </div>
          </div>

          {/* Nav */}
          <nav className="mx-auto flex items-center gap-1 rounded-lg border border-border/40 bg-muted/20 p-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200',
                    active
                      ? 'bg-teal-600/20 text-teal-400 shadow-sm'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground/80'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Right spacer for symmetry */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-md border border-border/40 bg-muted/20 px-2 py-1">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]" />
              <span className="font-mono text-[10px] text-muted-foreground">MOCK DATA</span>
            </div>
          </div>
        </div>
      </header>

      {/* View Content */}
      <main className="mx-auto max-w-[1600px] animate-fade-in" key={view}>
        {view === 'simulate' && <SimulateView />}
        {view === 'compare' && <CompareView />}
        {view === 'analyze' && <AnalyzeView />}
      </main>
    </div>
  );
}

export default App;
