import { useEffect, useRef, useState } from 'react';

import TerminalTopBar from './TerminalTopBar.jsx';
import TerminalSidebar from './TerminalSidebar.jsx';
import AuthGate from './AuthGate.jsx';

import WorkspaceSwitcher from './components/WorkspaceSwitcher.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import ConnectionStatus from './components/ConnectionStatus.jsx';

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
import AlertToast from './components/AlertToast.jsx';

import { useWorkspaceStore } from './store/workspaceStore';
import { useMarketStore } from './store/marketStore';
import { useChartStore } from './store/chartStore';
import { useWatchlistStore } from './store/watchlistStore';
import { useActiveSymbolStore } from './store/activeSymbolStore';
import { useSocketStore } from './store/socketStore';
import { useMarketRuntimeStore } from './store/marketRuntimeStore';
import { useAlertStore } from './store/alertStore.js';

import { api, getToken, getUser } from './api.js';

import './terminal.css';

function WorkspaceRenderer({ workspace, marketData }) {
  switch (workspace) {
    case 'Macro':
      return <MacroWorkspace marketData={marketData} />;
    case 'Portfolio':
      return <PortfolioWorkspace />;
    case 'Execution':
      return <ExecutionWorkspace />;
    case 'Replay':
      return <ReplayWorkspace />;
    case 'QuantLab':
      return <QuantLabWorkspace />;
    case 'StrategyLab':
      return <StrategyLabWorkspace />;
    case 'StrategyBuilder':
      return <StrategyBuilderWorkspace />;
    case 'PaperTrading':
      return (
        <ErrorBoundary>
          <PaperTradingWorkspace />
        </ErrorBoundary>
      );
    case 'LiveData':
      return <LiveDataWorkspace />;
    case 'ChartOrderflow':
      return <ChartOrderflowWorkspace />;
    case 'AILab':
      return <AILabWorkspace />;
    case 'Alerts':
      return <AlertsWorkspace />;
    case 'OMS':
      return <OMSWorkspace />;
    case 'Risk':
    default:
      return <RiskWorkspace marketData={marketData} />;
  }
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(getUser());
  const watchlist = useWatchlistStore((state) => state.watchlist);
  const refreshChart = useChartStore((state) => state.refreshChart);
  const setActiveSymbol = useActiveSymbolStore((state) => state.setSymbol);
  const subscribeWs = useActiveSymbolStore((state) => state.subscribeWs);
  const unsubscribeWs = useActiveSymbolStore((state) => state.unsubscribeWs);

  const workspace = useWorkspaceStore((state) => state.workspace);
  const marketData = useMarketStore((state) => state.prices);

  // Track the previous watchlist for subscribe/unsubscribe diffing.
  const prevWatchlistRef = useRef([]);

  useEffect(() => {
    const token = getToken();

    if (!token) {
      setAuthReady(true);
      return;
    }

    api.me().then((res) => setUser(res.user)).catch(() => setUser(null)).finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    useMarketStore.getState().initialize();
    // Initialize WS transport health tracking (fixes the dead socketStore.connected field).
    useSocketStore.getState().initialize();
    console.debug('[App] market + socket stores initialized');
  }, []);

  // Start canonical runtime polling once the user is authenticated.
  useEffect(() => {
    if (!user) return;
    useMarketRuntimeStore.getState().startPolling(7000);
    useAlertStore.getState().startPolling();
    console.debug('[App] marketRuntimeStore + alertStore polling started');
    return () => {
      useMarketRuntimeStore.getState().stopPolling();
      useAlertStore.getState().stopPolling();
      console.debug('[App] polling stopped');
    };
  }, [user]);

  // Manage WS subscriptions as the watchlist changes.
  // Subscribe newly-added symbols; unsubscribe removed symbols.
  useEffect(() => {
    const prev = new Set(prevWatchlistRef.current);
    const curr = new Set(watchlist);

    watchlist.forEach((sym) => {
      if (!prev.has(sym)) {
        subscribeWs(sym);
      }
    });

    prevWatchlistRef.current.forEach((sym) => {
      if (!curr.has(sym)) {
        unsubscribeWs(sym);
      }
    });

    prevWatchlistRef.current = watchlist;
  }, [watchlist, subscribeWs, unsubscribeWs]);

  const handleWatchlistSelect = async (symbol) => {
    // Update the single source of truth — subscriptions sync chartStore + feedStore.
    setActiveSymbol(symbol);
    // Ensure this symbol is subscribed on the WS.
    subscribeWs(symbol);
    // Kick the chart fetch immediately.
    await refreshChart();
  };

  if (!authReady) {
    return <div className="terminal-shell" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>Loading institutional terminal...</div>;
  }

  if (!user) {
    return <AuthGate onAuth={setUser} />;
  }

  return (
    <ErrorBoundary>
      <AlertToast />
      <div className="terminal-shell">
        <TerminalTopBar user={user} onLogout={() => setUser(null)} />
        <div style={{ display: 'flex', minHeight: 'calc(100vh - 58px)' }}>
          <TerminalSidebar watchlist={watchlist} socketStatus="ws" onSelectSymbol={handleWatchlistSelect} />
          <div style={{ flex: 1, minWidth: 0, padding: 20 }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ color: '#9ca3af', fontSize: 12, letterSpacing: 1, marginBottom: 6 }}>INSTITUTIONAL OPERATING SYSTEM</div>
              <h1 style={{ margin: 0 }}>Reversal Terminal</h1>
            </div>
            <div style={{ display: 'grid', gap: 12, marginBottom: 12 }}>
              <ConnectionStatus />
              <WorkspaceSwitcher />
            </div>
            <WorkspaceRenderer workspace={workspace} marketData={marketData} />
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
