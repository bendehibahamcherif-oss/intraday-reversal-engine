import { useEffect, useRef, useState } from 'react';

import TerminalTopBar from './TerminalTopBar.jsx';
import TerminalSidebar from './TerminalSidebar.jsx';
import AuthGate from './AuthGate.jsx';
import AlertToast from './components/AlertToast.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import TerminalStatusBar from './components/terminal/TerminalStatusBar.jsx';
import CommandPalette from './components/terminal/CommandPalette.jsx';
import MobileBottomNav from './components/terminal/MobileBottomNav.jsx';

import RiskWorkspace from './workspaces/RiskWorkspace.jsx';
import MacroWorkspace from './workspaces/MacroWorkspace.jsx';
import PortfolioWorkspace from './workspaces/PortfolioWorkspace.jsx';
import ExecutionWorkspace from './workspaces/ExecutionWorkspace.jsx';
import ReplayWorkspace from './workspaces/ReplayWorkspace.jsx';
import QuantLabWorkspace from './workspaces/QuantLabWorkspace.jsx';
import StrategyLabWorkspace from './workspaces/StrategyLabWorkspace.jsx';
import StrategyBuilderWorkspace from './workspaces/StrategyBuilderWorkspace.jsx';
import PaperTradingWorkspace from './workspaces/PaperTradingWorkspace.jsx';
import LiveDataWorkspace from './workspaces/LiveDataWorkspace.jsx';
import ChartOrderflowWorkspace from './workspaces/ChartOrderflowWorkspace.jsx';
import AILabWorkspace from './workspaces/AILabWorkspace.jsx';
import AlertsWorkspace from './workspaces/AlertsWorkspace.jsx';
import OMSWorkspace from './workspaces/OMSWorkspace.jsx';
import InstitutionalWorkspace from './workspaces/InstitutionalWorkspace.jsx';
import OpsWorkspace from './workspaces/OpsWorkspace.jsx';
import MLDashboard from './workspaces/MLDashboard.jsx';

import { useWorkspaceStore } from './store/workspaceStore';
import { useMarketStore } from './store/marketStore';
import { useChartStore } from './store/chartStore';
import { useWatchlistStore } from './store/watchlistStore';
import { useActiveSymbolStore } from './store/activeSymbolStore';
import { useSocketStore } from './store/socketStore';
import { useMarketRuntimeStore } from './store/marketRuntimeStore';
import { useAlertStore } from './store/alertStore.js';
import { useCommandPaletteStore } from './store/commandPaletteStore.js';
import { useTerminalLayoutStore } from './store/terminalLayoutStore.js';

import { api, getToken, getUser } from './api.js';

import './terminal.css';
import './styles/terminalTheme.css';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler, { passive: true });
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

function WorkspaceRenderer({ workspace, marketData }) {
  switch (workspace) {
    case 'Macro':           return <MacroWorkspace marketData={marketData} />;
    case 'Portfolio':       return <PortfolioWorkspace />;
    case 'Execution':       return <ExecutionWorkspace />;
    case 'Replay':          return <ReplayWorkspace />;
    case 'QuantLab':        return <QuantLabWorkspace />;
    case 'StrategyLab':     return <StrategyLabWorkspace />;
    case 'StrategyBuilder': return <StrategyBuilderWorkspace />;
    case 'PaperTrading':
      return (
        <ErrorBoundary>
          <PaperTradingWorkspace />
        </ErrorBoundary>
      );
    case 'LiveData':        return <LiveDataWorkspace />;
    case 'ChartOrderflow':  return <ChartOrderflowWorkspace />;
    case 'AILab':           return <AILabWorkspace />;
    case 'Alerts':          return <AlertsWorkspace />;
    case 'OMS':             return <OMSWorkspace />;
    case 'Institutional':   return <InstitutionalWorkspace />;
    case 'Ops':             return <OpsWorkspace />;
    case 'MLEngine':        return <MLDashboard />;
    case 'Risk':
    default:                return <RiskWorkspace marketData={marketData} />;
  }
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser]           = useState(getUser());

  const watchlist       = useWatchlistStore((s) => s.watchlist);
  const refreshChart    = useChartStore((s) => s.refreshChart);
  const setActiveSymbol = useActiveSymbolStore((s) => s.setSymbol);
  const subscribeWs     = useActiveSymbolStore((s) => s.subscribeWs);
  const unsubscribeWs   = useActiveSymbolStore((s) => s.unsubscribeWs);
  const workspace       = useWorkspaceStore((s) => s.workspace);
  const setWorkspace    = useWorkspaceStore((s) => s.setWorkspace);
  const marketData      = useMarketStore((s) => s.prices);
  const openPalette     = useCommandPaletteStore((s) => s.openPalette);
  const fullscreenPanel = useTerminalLayoutStore((s) => s.fullscreenPanel);
  const exitFullscreen  = useTerminalLayoutStore((s) => s.exitFullscreen);

  const isMobile         = useIsMobile();
  const prevWatchlistRef = useRef([]);

  // Auth check
  useEffect(() => {
    const token = getToken();
    if (!token) { setAuthReady(true); return; }
    api.me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setAuthReady(true));
  }, []);

  // Initialize stores once on mount
  useEffect(() => {
    useMarketStore.getState().initialize();
    useSocketStore.getState().initialize();
  }, []);

  // Start runtime polling after auth
  useEffect(() => {
    if (!user) return;
    useMarketRuntimeStore.getState().startPolling(7000);
    useAlertStore.getState().startPolling();
    return () => {
      useMarketRuntimeStore.getState().stopPolling();
      useAlertStore.getState().stopPolling();
    };
  }, [user]);

  // Manage WS subscriptions as watchlist changes
  useEffect(() => {
    const prev = new Set(prevWatchlistRef.current);
    const curr = new Set(watchlist);
    watchlist.forEach((sym) => { if (!prev.has(sym)) subscribeWs(sym); });
    prevWatchlistRef.current.forEach((sym) => { if (!curr.has(sym)) unsubscribeWs(sym); });
    prevWatchlistRef.current = watchlist;
  }, [watchlist, subscribeWs, unsubscribeWs]);

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e) {
      const inInput =
        e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.isContentEditable;

      // Ctrl+K — command palette (works everywhere)
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openPalette();
        return;
      }

      // Alt+1-6 — workspace switching (works everywhere)
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const altMap = {
          '1': 'ChartOrderflow',
          '2': 'Execution',
          '3': 'Alerts',
          '4': 'MLEngine',
          '5': 'Portfolio',
          '6': 'Risk',
        };
        if (altMap[e.key]) {
          e.preventDefault();
          setWorkspace(altMap[e.key]);
          return;
        }
      }

      if (inInput) return;

      // / — focus symbol search
      if (e.key === '/') {
        e.preventDefault();
        document.querySelector('.t-symbol-input')?.focus();
        return;
      }

      // R — refresh chart
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        refreshChart?.();
        return;
      }

      // F / Escape — exit fullscreen panel
      if ((e.key === 'f' || e.key === 'F' || e.key === 'Escape') && fullscreenPanel) {
        exitFullscreen?.();
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openPalette, setWorkspace, refreshChart, fullscreenPanel, exitFullscreen]);

  const handleWatchlistSelect = async (symbol) => {
    setActiveSymbol(symbol);
    subscribeWs(symbol);
    await refreshChart();
  };

  if (!authReady) {
    return (
      <div style={{
        display: 'grid',
        placeItems: 'center',
        height: '100vh',
        background: '#080C10',
        color: '#9DA7B3',
        fontSize: 13,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        Loading terminal...
      </div>
    );
  }

  if (!user) return <AuthGate onAuth={setUser} />;

  // ── Mobile layout ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <ErrorBoundary>
        <AlertToast />
        <CommandPalette />
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100dvh',
          background: 'var(--t-bg-0)',
          overflow: 'hidden',
          color: 'var(--t-text)',
          fontFamily: 'var(--t-font-ui)',
        }}>
          <TerminalTopBar user={user} onLogout={() => setUser(null)} />
          <div style={{ flex: 1, overflow: 'auto', paddingBottom: 56 }}>
            <WorkspaceRenderer workspace={workspace} marketData={marketData} />
          </div>
          <MobileBottomNav />
        </div>
      </ErrorBoundary>
    );
  }

  // ── Desktop layout ─────────────────────────────────────────────────────────
  return (
    <ErrorBoundary>
      <AlertToast />
      <CommandPalette />
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'var(--t-bg-0)',
        overflow: 'hidden',
        color: 'var(--t-text)',
        fontFamily: 'var(--t-font-ui)',
      }}>
        <TerminalTopBar user={user} onLogout={() => setUser(null)} />

        <div style={{
          display: 'flex',
          flex: 1,
          overflow: 'hidden',
          paddingBottom: 'var(--t-statusbar-h)',
        }}>
          <TerminalSidebar
            watchlist={watchlist}
            socketStatus="ws"
            onSelectSymbol={handleWatchlistSelect}
          />
          <main style={{
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
          }}>
            <WorkspaceRenderer workspace={workspace} marketData={marketData} />
          </main>
        </div>

        <TerminalStatusBar />
      </div>
    </ErrorBoundary>
  );
}
