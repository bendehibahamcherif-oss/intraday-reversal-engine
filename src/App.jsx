import { useEffect, useRef, useState } from 'react';

import TerminalTopBar from './TerminalTopBar.jsx';
import TerminalSidebar from './TerminalSidebar.jsx';
import AuthGate from './AuthGate.jsx';
import AlertToast from './components/AlertToast.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import TerminalStatusBar from './components/terminal/TerminalStatusBar.jsx';
import CommandPalette from './components/terminal/CommandPalette.jsx';
import MobileBottomNav from './components/terminal/MobileBottomNav.jsx';

import { DEFAULT_WORKSPACE_ID, getWorkspace, normalizeWorkspaceId } from './config/workspaces.js';
import { getWorkspaceComponent } from './config/workspaceComponents.jsx';

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

function WorkspaceCrashFallback({ workspace, onReset }) {
  return (
    <div style={{ height: '100%', overflow: 'auto', background: 'var(--t-bg-0)', color: 'var(--t-text)', fontFamily: 'var(--t-font-ui)' }}>
      <div style={{ maxWidth: 560, margin: '40px auto', background: '#0d0d1a', border: '1px solid #1f2937', borderRadius: 10, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ color: '#ef4444', fontSize: 18 }}>⚠</span>
          <strong style={{ fontSize: 15 }}>This workspace hit an error</strong>
        </div>
        <p style={{ color: '#9ca3af', fontSize: 13, margin: '0 0 14px' }}>
          The “{workspace}” workspace failed to render. The rest of the terminal is still
          running — switch workspaces from the sidebar, or retry.
        </p>
        <button
          onClick={onReset}
          style={{ background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          ↺ Retry workspace
        </button>
      </div>
    </div>
  );
}

function WorkspaceRenderer({ workspace, marketData }) {
  // Scoped boundary: a crash in one workspace shows an inline fallback instead of
  // blanking the whole terminal shell. key={workspace} remounts (and clears the
  // error) whenever the user navigates to a different workspace.
  return (
    <ErrorBoundary
      key={workspace}
      fallback={({ reset }) => <WorkspaceCrashFallback workspace={workspace} onReset={reset} />}
    >
      <WorkspaceSwitch workspace={workspace} marketData={marketData} />
    </ErrorBoundary>
  );
}

function WorkspaceSwitch({ workspace, marketData }) {
  const workspaceConfig = getWorkspace(workspace);
  const WorkspaceComponent = getWorkspaceComponent(workspaceConfig);

  if (!WorkspaceComponent) {
    const DefaultComponent = getWorkspaceComponent(getWorkspace(DEFAULT_WORKSPACE_ID));
    return <DefaultComponent marketData={marketData} />;
  }

  return <WorkspaceComponent marketData={marketData} />;
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

  // Validate hydrated/persisted workspace ids so stale or corrupt values cannot
  // leave either desktop or mobile navigation pointing at a blank workspace.
  useEffect(() => {
    const validWorkspace = normalizeWorkspaceId(workspace);
    if (validWorkspace !== workspace) setWorkspace(validWorkspace);
  }, [workspace, setWorkspace]);

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
        <div
          data-testid="terminal-shell"
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100dvh',
            background: 'var(--t-bg-0)',
            overflow: 'hidden',
            color: 'var(--t-text)',
            fontFamily: 'var(--t-font-ui)',
          }}
        >
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
      <div
        data-testid="terminal-shell"
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          background: 'var(--t-bg-0)',
          overflow: 'hidden',
          color: 'var(--t-text)',
          fontFamily: 'var(--t-font-ui)',
        }}
      >
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
